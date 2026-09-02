use axum::extract::State;
use axum::Json;
use serde::Deserialize;
use utoipa::ToSchema;

use crate::AppState;

/// Payload sent by Safaricom Daraja to our ResultURL / QueueTimeOutURL
/// after a B2C payment completes or times out.
#[derive(Debug, Deserialize, ToSchema)]
pub struct B2CCallbackPayload {
    pub result: B2CResult,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct B2CResult {
    #[serde(rename = "ConversationID")]
    pub conversation_id: Option<String>,
    #[serde(rename = "OriginatorConversationID")]
    pub originator_conversation_id: Option<String>,
    #[serde(rename = "ResultCode")]
    pub result_code: Option<i64>,
    #[serde(rename = "ResultDesc")]
    pub result_desc: Option<String>,
}

/// M-Pesa B2C callback receiver.
///
/// Safaricom calls this endpoint asynchronously after processing a B2C payment.
/// ResultCode 0 means success. Any other code means failure.
#[utoipa::path(
    post,
    path = "/api/v1/mpesa/b2c-callback",
    tag = "m-pesa",
    request_body = B2CCallbackPayload,
    responses(
        (status = 200, description = "Callback acknowledged", body = serde_json::Value),
    ),
)]
pub async fn b2c_callback(
    State(state): State<std::sync::Arc<AppState>>,
    Json(payload): Json<B2CCallbackPayload>,
) -> Json<serde_json::Value> {
    let result_code = payload.result.result_code.unwrap_or(-1);
    let conversation_id = payload.result.conversation_id.as_deref().unwrap_or("unknown");
    let result_desc = payload.result.result_desc.as_deref().unwrap_or("no description");

    tracing::info!(
        conversation_id = conversation_id,
        result_code = result_code,
        result_desc = result_desc,
        "M-Pesa B2C callback received"
    );

    if result_code == 0 {
        // Success — find the payout job by conversation ID and mark it completed.
        // In a real system you'd store the conversation_id on the payout_job when dispatching.
        tracing::info!(
            conversation_id = conversation_id,
            "B2C payment completed successfully"
        );
    } else {
        // Failure — we should flag for retry or manual review
        tracing::warn!(
            conversation_id = conversation_id,
            result_code = result_code,
            result_desc = result_desc,
            "B2C payment failed"
        );

        // Try to find and update the payout job by conversation_id stored in last_error
        let update_result = sqlx::query(
            r#"
            UPDATE payout_jobs
            SET last_error = $1
            WHERE last_error LIKE $2
              AND status IN ('dispatching', 'queued')
            "#,
        )
        .bind(format!("mpesa_conv:{conversation_id}"))
        .bind("%mpesa_conv:%")
        .execute(&state.db)
        .await;

        if let Err(e) = update_result {
            tracing::error!(error = ?e, "failed to update payout job from B2C callback");
        }
    }

    Json(serde_json::json!({
        "ResultCode": 0,
        "ResultDesc": "Conduit received the callback"
    }))
}

/// Callback for STK Push (Lipa Na M-Pesa Online) transactions.
#[derive(Debug, Deserialize, ToSchema)]
pub struct StkCallbackPayload {
    pub stk_callback: StkCallback,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct StkCallback {
    #[serde(rename = "MerchantRequestID")]
    pub merchant_request_id: Option<String>,
    #[serde(rename = "CheckoutRequestID")]
    pub checkout_request_id: Option<String>,
    #[serde(rename = "ResultCode")]
    pub result_code: Option<i64>,
    #[serde(rename = "ResultDesc")]
    pub result_desc: Option<String>,
    #[serde(rename = "CallbackMetadata")]
    pub callback_metadata: Option<serde_json::Value>,
}

/// M-Pesa STK Push callback receiver.
///
/// Called by Safaricom after an STK Push (Lipa Na M-Pesa Online) transaction.
#[utoipa::path(
    post,
    path = "/api/v1/mpesa/stk-callback",
    tag = "m-pesa",
    request_body = StkCallbackPayload,
    responses(
        (status = 200, description = "Callback acknowledged", body = serde_json::Value),
    ),
)]
pub async fn stk_callback(
    State(_state): State<std::sync::Arc<AppState>>,
    Json(payload): Json<StkCallbackPayload>,
) -> Json<serde_json::Value> {
    let cb = &payload.stk_callback;
    let result_code = cb.result_code.unwrap_or(-1);
    let checkout_id = cb.checkout_request_id.as_deref().unwrap_or("unknown");

    tracing::info!(
        checkout_request_id = checkout_id,
        result_code = result_code,
        "M-Pesa STK Push callback received"
    );

    if result_code == 0 {
        tracing::info!("STK Push payment completed for {checkout_id}");
    } else {
        tracing::warn!(
            checkout_request_id = checkout_id,
            result_desc = ?cb.result_desc,
            "STK Push payment failed"
        );
    }

    Json(serde_json::json!({
        "ResultCode": 0,
        "ResultDesc": "Conduit received the STK callback"
    }))
}
