import { describe, expect, it } from "vitest";
import { adminClient, anonClient, createUser, uniq } from "./helpers";

describe("profiles", () => {
  it("creates a profile with the requested username on sign-up", async () => {
    const user = await createUser();
    const { data } = await user.client.from("profiles").select("username, role").eq("id", user.id).single();
    expect(data).toEqual({ username: user.username, role: "user" });
  });

  it("falls back to a generated username when the requested one is taken or invalid", async () => {
    const taken = await createUser();
    const admin = adminClient();
    for (const requested of [taken.username, "no spaces allowed"]) {
      const { data, error } = await admin.auth.admin.createUser({
        email: `dup_${uniq()}@test.local`,
        password: "correct-horse-battery",
        email_confirm: true,
        user_metadata: { username: requested },
      });
      expect(error).toBeNull();
      const { data: profile } = await admin.from("profiles").select("username").eq("id", data.user!.id).single();
      expect(profile!.username).toMatch(/^user_[0-9a-f]{10}$/);
      await admin.auth.admin.deleteUser(data.user!.id);
    }
  });

  it("treats usernames case-insensitively", async () => {
    const user = await createUser();
    const { data } = await user.client.from("profiles").select("id").eq("username", user.username.toUpperCase());
    expect(data).toEqual([{ id: user.id }]);
  });

  it("lets users change their display name but not their role", async () => {
    const user = await createUser();
    const renamed = await user.client.from("profiles").update({ display_name: "Festival Fan" }).eq("id", user.id);
    expect(renamed.error).toBeNull();

    const escalate = await user.client.from("profiles").update({ role: "admin" }).eq("id", user.id);
    expect(escalate.error?.code).toBe("42501");
    const { data } = await user.client.from("profiles").select("role, display_name").eq("id", user.id).single();
    expect(data).toEqual({ role: "user", display_name: "Festival Fan" });
  });

  it("does not let users edit someone else's profile", async () => {
    const [alice, bob] = await Promise.all([createUser(), createUser()]);
    await alice.client.from("profiles").update({ display_name: "hacked" }).eq("id", bob.id);
    const { data } = await bob.client.from("profiles").select("display_name").eq("id", bob.id).single();
    expect(data!.display_name).not.toBe("hacked");
  });

  it("only lets admins change roles", async () => {
    const [admin, user, target] = await Promise.all([createUser("admin"), createUser(), createUser()]);

    const denied = await user.client.rpc("set_user_role", { target_username: target.username, new_role: "moderator" });
    expect(denied.error?.message).toMatch(/only admins/);

    const granted = await admin.client.rpc("set_user_role", { target_username: target.username, new_role: "moderator" });
    expect(granted.error).toBeNull();
    const { data } = await admin.client.from("profiles").select("role").eq("id", target.id).single();
    expect(data!.role).toBe("moderator");

    const missing = await admin.client.rpc("set_user_role", { target_username: "nobody_here_x", new_role: "user" });
    expect(missing.error?.message).toMatch(/no user named/);
  });

  it("does not expose the role RPC to signed-out visitors", async () => {
    const result = await anonClient().rpc("set_user_role", { target_username: "x", new_role: "admin" });
    expect(result.error).not.toBeNull();
  });
});
