import PolicyPage from "@/components/PolicyPage";
export default function PrivacyPage() { return <PolicyPage title="Privacy Policy" effective="2 August 2026" sections={[
  { heading: "Information we collect", body: "We collect contact, order, payment-reference, account, device-security and support information needed to sell and deliver data bundles and vouchers, administer agent accounts and prevent fraud. We never ask customers for a mobile-money PIN, OTP or account password." },
  { heading: "How information is used", body: "Information is used for payment verification, order delivery, support, refunds, agent commission accounting, security monitoring, legal compliance and service notifications. Access is limited by role and recorded where appropriate." },
  { heading: "Processors and retention", body: "Necessary information may be processed by Paystack, network/data delivery providers, messaging providers, hosting and database providers. Financial and audit records are retained for operational, dispute and legal requirements; unnecessary information is deleted or anonymized when practical." },
  { heading: "Your choices", body: "You may request correction or deletion of eligible personal information. Financial, fraud-prevention and completed transaction records may need to be retained. Contact support using the details below." },
]} />; }
