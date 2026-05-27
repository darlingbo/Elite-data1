export default async () => {
  const url = `${process.env.SITE_URL ?? "https://elitedata1.com"}/api/cron/snapshot`;
  await fetch(url, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
};

export const config = { schedule: "0 0 * * *" };
