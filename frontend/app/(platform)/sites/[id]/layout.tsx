import { CategoryLayout } from "@/components/platform/site/CategoryLayout";

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CategoryLayout siteId={id}>{children}</CategoryLayout>;
}
