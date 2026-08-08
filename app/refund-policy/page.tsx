import PolicyPage from "@/components/PolicyPage";
export default function RefundPolicyPage() { return <PolicyPage title="Refund & Dispute Policy" effective="2 August 2026" sections={[
  { heading: "Eligible refunds", body: "A paid order is eligible for review when delivery fails, the order is rejected before delivery, or the platform confirms that the purchased service was not supplied. Completed and successfully delivered bundles or issued voucher codes are not refundable." },
  { heading: "How to request", body: "Use Track Order and submit the correct order reference and payment phone number. Requests should be raised within 48 hours of the final failed or rejected status. Never send a MoMo PIN or OTP." },
  { heading: "Processing", body: "Approved refunds are returned through the supported payment or verified refund channel. Most requests are reviewed within 12 hours, although bank or payment-provider settlement can take longer. Duplicate, fraudulent or already-refunded claims are declined." },
  { heading: "Agent commission reversals", body: "When an agent-team order is refunded, its selling-agent, Pro sub-admin and platform commission accounting is reversed. If earnings were already withdrawn, the responsible balance may become negative and future earnings will first clear that debt." },
]} />; }
