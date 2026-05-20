import { auth } from "@clerk/nextjs/server";

export default async function DashboardPage() {
  const { orgSlug } = await auth();
  return (
    <div>
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-2 text-muted-foreground">
        Workspace: {orgSlug ?? "No workspace selected"}
      </p>
    </div>
  );
}
