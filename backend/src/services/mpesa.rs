use std::time::{Duration, Instant};

use anyhow::Result;
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use crate::config::Config;

// ---------------------------------------------------------------------------
// OAuth token cache
// ---------------------------------------------------------------------------

struct TokenCache {
    access_token: String,
    expires_at: Instant,
}

/// M-Pesa Daraja API client with automatic OAuth token management.
pub struct DarajaClient {
    http: Client,
    config: Config,
    token: RwLock<Option<TokenCache>>,
}

/// Response from the Daraja OAuth endpoint.
#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: String,
}

/// Synchronous response from a B2C payment request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct B2CResponse {
    pub originator_conversation_id: Option<String>,
    pub conversation_id: Option<String>,
    pub response_code: Option<String>,
    pub response_description: Option<String>,
    pub merchant_request_id: Option<String>,
}

/// Async callback payload sent by Daraja to ResultURL.
#[derive(Debug, Deserialize)]
pub struct B2CCallbackPayload {
    pub result: B2CCallbackResult,
}

#[derive(Debug, Deserialize)]
pub struct B2CCallbackResult {
    pub conversation_id: Option<String>,
    pub originator_conversation_id: Option<String>,
    pub result_code: Option<i64>,
    pub result_desc: Option<String>,
}

/// STK Push (Lipa Na M-Pesa Online) request body.
#[derive(Debug, Serialize)]
pub struct StkPushRequest {
    #[serde(rename = "BusinessShortCode")]
    pub business_short_code: String,
    #[serde(rename = "Password")]
    pub password: String,
    #[serde(rename = "Timestamp")]
    pub timestamp: String,
    #[serde(rename = "TransactionType")]
    pub transaction_type: String,
    #[serde(rename = "Amount")]
    pub amount: String,
    #[serde(rename = "PartyA")]
    pub party_a: String,
    #[serde(rename = "PartyB")]
    pub party_b: String,
    #[serde(rename = "PhoneNumber")]
    pub phone_number: String,
    #[serde(rename = "CallBackURL")]
    pub callback_url: String,
    #[serde(rename = "AccountReference")]
    pub account_reference: String,
    #[serde(rename = "TransactionDesc")]
    pub transaction_desc: String,
}

/// STK Push response.
#[derive(Debug, Deserialize)]
pub struct StkPushResponse {
    pub merchant_request_id: Option<String>,
    pub checkout_request_id: Option<String>,
    pub response_code: Option<String>,
    pub response_description: Option<String>,
    pub customer_message: Option<String>,
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

impl DarajaClient {
    pub fn new(config: Config) -> Self {
        let http = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .expect("failed to build HTTP client");

        Self {
            http,
            config,
            token: RwLock::new(None),
        }
    }

    /// Get a valid access token, refreshing if expired.
    async fn get_access_token(&self) -> Result<String> {
        // Check cache first
        {
            let cache = self.token.read().await;
            if let Some(ref cached) = *cache {
                if Instant::now() < cached.expires_at {
                    return Ok(cached.access_token.clone());
                }
            }
        }

        // Refresh the token
        let credentials = format!(
            "{}:{}",
            self.config.daraja_consumer_key,
            self.config.daraja_consumer_secret
        );
        let encoded = STANDARD.encode(credentials.as_bytes());

        let url = format!("{}/oauth/v1/generate?grant_type=client_credentials", self.config.daraja_base_url);

        let resp = self
            .http
            .get(&url)
            .header("Authorization", format!("Basic {encoded}"))
            .send()
            .await?
            .error_for_status()?;

        let body: TokenResponse = resp.json().await?;

        let expires_in_secs: u64 = body
            .expires_in
            .parse()
            .unwrap_or(3500);

        let cache = TokenCache {
            access_token: body.access_token.clone(),
            expires_at: Instant::now() + Duration::from_secs(expires_in_secs),
        };

        {
            let mut writer = self.token.write().await;
            *writer = Some(cache);
        }

        tracing::info!("refreshed M-Pesa OAuth token (expires in {expires_in_secs}s)");
        Ok(body.access_token)
    }

    /// Initiate a B2C payment request to disburse funds to a vendor.
    pub async fn b2c_payment(
        &self,
        phone_number: &str,
        amount_cents: i64,
        occasion: &str,
    ) -> Result<B2CResponse> {
        let token = self.get_access_token().await?;

        let amount_kes = (amount_cents as f64) / 100.0;

        let body = serde_json::json!({
            "InitiatorName": self.config.daraja_initiator_name,
            "SecurityCredential": "PLACEHOLDER", // In production, encrypt with Daraja's cert
            "CommandID": "BusinessPayment",
            "Amount": format!("{:.2}", amount_kes),
            "PartyA": self.config.daraja_short_code,
            "PartyB": phone_number,
            "Remarks": format!("Payout for {occasion}"),
            "QueueTimeOutURL": self.config.daraja_callback_url,
            "ResultURL": self.config.daraja_callback_url,
            "Occasion": occasion,
        });

        let url = format!(
            "{}/mp/b2c/v1/paymentrequest",
            self.config.daraja_base_url
        );

        tracing::info!(
            phone = phone_number,
            amount = amount_kes,
            "initiating M-Pesa B2C payment"
        );

        let resp = self
            .http
            .post(&url)
            .bearer_auth(&token)
            .json(&body)
            .send()
            .await?;

        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();

        if !status.is_success() {
            tracing::error!(status = %status, body = %text, "M-Pesa B2C request failed");
            anyhow::bail!("M-Pesa B2C HTTP {status}: {text}");
        }

        let result: B2CResponse = serde_json::from_str(&text).unwrap_or_else(|_| {
            tracing::warn!(body = %text, "could not parse B2C response JSON");
            B2CResponse {
                originator_conversation_id: None,
                conversation_id: None,
                response_code: Some("9999".into()),
                response_description: Some(text),
                merchant_request_id: None,
            }
        });

        if result.response_code.as_deref() == Some("0") {
            tracing::info!(
                conversation_id = ?result.conversation_id,
                merchant_request_id = ?result.merchant_request_id,
                "M-Pesa B2C request accepted"
            );
        } else {
            tracing::warn!(
                response_code = ?result.response_code,
                description = ?result.response_description,
                "M-Pesa B2C request returned non-zero code"
            );
        }

        Ok(result)
    }

    /// Initiate an STK Push (Lipa Na M-Pesa Online) — used for customer-to-business
    /// payments. Useful for testing the full flow or for platforms that collect
    /// payments via STK Push before splitting.
    pub async fn stk_push(
        &self,
        phone_number: &str,
        amount_cents: i64,
        account_ref: &str,
    ) -> Result<StkPushResponse> {
        let token = self.get_access_token().await?;

        let amount_kes = (amount_cents as f64) / 100.0;

        // Generate timestamp in the format Safaricom expects: YYYYMMDDHHmmss
        let now = chrono::Utc::now();
        let timestamp = now.format("%Y%m%d%H%M%S").to_string();

        // Password = base64(BusinessShortCode + Passkey + Timestamp)
        let password_input = format!(
            "{}{}{}",
            self.config.daraja_short_code,
            self.config.daraja_passkey,
            timestamp
        );
        let password = STANDARD.encode(password_input.as_bytes());

        let stk_body = StkPushRequest {
            business_short_code: self.config.daraja_short_code.clone(),
            password,
            timestamp,
            transaction_type: "CustomerPayBillOnline".into(),
            amount: format!("{:.2}", amount_kes),
            party_a: phone_number.to_string(),
            party_b: self.config.daraja_short_code.clone(),
            phone_number: phone_number.to_string(),
            callback_url: self.config.daraja_callback_url.clone(),
            account_reference: account_ref.to_string(),
            transaction_desc: format!("Conduit payment {account_ref}"),
        };

        let url = format!(
            "{}/mp/stkpush/v1/processrequest",
            self.config.daraja_base_url
        );

        tracing::info!(
            phone = phone_number,
            amount = amount_kes,
            account_ref = account_ref,
            "initiating STK Push"
        );

        let resp = self
            .http
            .post(&url)
            .bearer_auth(&token)
            .json(&stk_body)
            .send()
            .await?;

        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();

        if !status.is_success() {
            tracing::error!(status = %status, body = %text, "STK Push request failed");
            anyhow::bail!("STK Push HTTP {status}: {text}");
        }

        let result: StkPushResponse = serde_json::from_str(&text).unwrap_or_else(|_| {
            tracing::warn!(body = %text, "could not parse STK Push response JSON");
            StkPushResponse {
                merchant_request_id: None,
                checkout_request_id: None,
                response_code: Some("9999".into()),
                response_description: Some(text),
                customer_message: None,
            }
        });

        tracing::info!(
            checkout_request_id = ?result.checkout_request_id,
            response_code = ?result.response_code,
            "STK Push response received"
        );

        Ok(result)
    }
}
