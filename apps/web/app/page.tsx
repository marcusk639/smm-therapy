import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function RootPage() {
  const { userId, orgId } = await auth();

  if (userId && orgId) {
    redirect("/dashboard");
  }

  redirect("/sign-in");
}
