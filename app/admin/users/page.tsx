import { getAllUsers } from "@/lib/admin";
import { AdminUsersTable } from "@/components/admin-users-table";

export default async function AdminUsersPage() {
  const users = await getAllUsers();

  return (
    <div className="dash-stack">
      <div>
        <p className="dash-page-eyebrow">Users</p>
        <h1 className="dash-page-title">All users</h1>
        <p className="dash-page-subtitle">
          {users.length} account{users.length === 1 ? "" : "s"} across every
          organization. Resetting a password generates a new one-time
          temporary password — it&apos;s never stored or logged in plain
          text.
        </p>
      </div>

      <AdminUsersTable users={users} />
    </div>
  );
}
