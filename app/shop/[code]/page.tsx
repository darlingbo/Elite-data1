"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AgentStorefront from "@/components/AgentStorefront";

interface AgentInfo {
  name: string;
  whatsapp: string;
  shop_name: string | null;
  agent_type: string | null;
  is_pro: boolean;
}

export default function ShopPage() {
  const params = useParams();
  const code = (params.code as string ?? "").toUpperCase();
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!code) return;
    fetch(`/api/agents/info?code=${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setAgent(d);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true));
  }, [code]);

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <p className="text-6xl mb-4">🔍</p>
          <h1 className="text-2xl font-black text-gray-800 mb-2">Store Not Found</h1>
          <p className="text-gray-500 mb-6">The agent link <strong>{code}</strong> doesn&apos;t exist or is no longer active.</p>
          <Link href="/" className="inline-block bg-blue-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors">
            Buy Directly from Elite Data
          </Link>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const shopName = agent.shop_name || agent.name;

  return (
    <AgentStorefront
      shopName={shopName}
      agentName={agent.name}
      agentWhatsapp={agent.whatsapp}
      agentCode={code}
      isPro={agent.is_pro}
    />
  );
}
