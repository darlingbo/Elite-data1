export default async () => {
  const url = `${process.env.SITE_URL ?? "https://elitedata1.com"}/api/cron/sync-orders`;
  await fetch(url, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
};

export const config = { schedule: "5 0 * * *" };
