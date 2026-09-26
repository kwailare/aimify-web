import { AdminPlansManager } from "@/components/admin-plans-manager";
import { getAdminPlans } from "@/lib/admin";

export default async function AdminPlansPage() {
  const plans = await getAdminPlans();

  return (
    <div className="dash-stack dash-stack--wide">
      <div>
        <p className="dash-page-eyebrow">Plans</p>
        <h1 className="dash-page-title">Plans and limits</h1>
        <p className="dash-page-subtitle">
          Set what each plan costs and how much it allows. Limits are enforced
          on the website and in the desktop app. Leave a limit empty for
          unlimited. Lowering a limit never deletes anything; it only stops an
          organization adding more once it is at the limit.
        </p>
      </div>

      <AdminPlansManager plans={plans} />
    </div>
  );
}
