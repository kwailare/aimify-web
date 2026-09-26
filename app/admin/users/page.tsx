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
          organization. Open a user to see their full details and recent
          activity. Resetting a password generates a one-time temporary
          password that is never stored or logged in plain text.
        </p>
      </div>

      <AdminUsersTable users={users} />
    </div>
  );
}
