export const ORDER_REVIEW_WINDOW_SECONDS = 40;

export function getOrderReviewSecondsRemaining(createdAt: string, now = Date.now()): number {
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return ORDER_REVIEW_WINDOW_SECONDS;
  return Math.max(0, Math.ceil((created + ORDER_REVIEW_WINDOW_SECONDS * 1000 - now) / 1000));
}

export function orderReviewWaitMessage(seconds: number): string {
  return `Please review this order for ${seconds} more second${seconds === 1 ? "" : "s"} before acting`;
}
