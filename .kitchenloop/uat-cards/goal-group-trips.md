# UAT Card — Traveler group trips (spec 040, ticket goal-group-trips)

**Surface:** consumer web (traveler). **Type:** browser journey via Playwright MCP.
**The app is ALREADY RUNNING** at `http://127.0.0.1:3000` (a built compose stack). You do
NOT need Bash, Docker, curl, or any install — drive the browser only. Use the exact URLs
below. Take a screenshot after each numbered step.

**What you are verifying:** a verified premium traveler creates a group around a trip,
invites another traveler who must also verify before joining, they chat, and the organizer
can finalize **only after every member confirms** (the "all-party" trust gate). An
unverified user is blocked from posting/joining.

**Two accounts (use these EXACT values):**
- Organizer — name `UAT Organizer`, email `uat-org-iter11@example.test`, password `uat-group-pass-11`
- Member — name `UAT Member`, email `uat-mem-iter11@example.test`, password `uat-group-pass-11`

> Reading dynamic links: after the group is created you will see a group URL in the address
> bar and an **invite path** (`/view/groups/join/<id>`) printed inside the "Invite" card.
> Read these EXACTLY from the page snapshot — do not retype from memory. Reuse them verbatim.

---

## Steps

1. **Sign up the organizer.** Navigate to `http://127.0.0.1:3000/view/sign-up`. Fill
   "Your name" = `UAT Organizer`, "Email" = `uat-org-iter11@example.test`, "Password" =
   `uat-group-pass-11`. Click **Create account**.
   **Expect:** the page navigates to `http://127.0.0.1:3000/view` (the traveler home).

2. **Link a trip.** Navigate to `http://127.0.0.1:3000/view/a29198a9-d113-4d4b-bd6a-17a95e983b9d`.
   **Expect:** a shared trip page whose title contains **`Paris balanced trip`**.

3. **Open Group trips — eligibility gate.** Navigate to `http://127.0.0.1:3000/view/groups`.
   **Expect:** a card headed **`Become a verified premium member`** with a **`Verify & go premium`**
   button. **There is NO "Create a group trip" form yet** (an unverified user cannot create).

4. **Verify (become premium).** Click **`Verify & go premium`**.
   **Expect:** the page now shows a **`Create a group trip`** form with a **Trip** dropdown whose
   selected option contains **`Paris balanced trip`**, plus a **Group name** field.

5. **Create the group.** In "Group name" type `UAT Paris crew`. Click **`Create group`**.
   **Expect:** the URL becomes `http://127.0.0.1:3000/view/groups/<some-id>` (a group detail page)
   with heading **`UAT Paris crew`**, a status badge **`Forming`**, a members line
   **`Members 1/1 confirmed`** listing **`Organizer: UAT Organizer`** as **`Confirmed`**, and an
   **Invite** card printing a path like **`/view/groups/join/<id>`**.
   **RECORD:** (a) this group URL from the address bar, and (b) the exact invite path text.

6. **Sign up the member.** Click **`Sign out`**. Then navigate to
   `http://127.0.0.1:3000/view/sign-up` and create the member account: "Your name" =
   `UAT Member`, "Email" = `uat-mem-iter11@example.test`, "Password" = `uat-group-pass-11`.
   Click **Create account**. **Expect:** navigates to `http://127.0.0.1:3000/view`.

7. **Open the invite — join gate.** Navigate to `http://127.0.0.1:3000` + the invite path you
   recorded in step 5 (e.g. `http://127.0.0.1:3000/view/groups/join/<id>`).
   **Expect:** a card headed **`First, become a verified premium member`** with a
   **`Verify & go premium`** button. **The "Join group" button is NOT shown yet** (an unverified
   user cannot join).

8. **Verify + join.** Click **`Verify & go premium`**. **Expect:** a **`Join this group`** heading
   with a **`Join group`** button appears. Click **`Join group`**.
   **Expect:** the URL becomes the group detail page; the members line reads
   **`Members 1/2 confirmed`** listing **`Member: UAT Member`** as **`Pending`**; the page shows an
   **`I’m in — confirm`** button and **NO `Finalize trip` button** (only the organizer can finalize).

9. **Chat.** In the "Message the group…" box type `Ready for Paris!` and click **`Send`**.
   **Expect:** the message **`Ready for Paris!`** appears in the Messages list.

10. **Switch to the organizer.** Click **`Sign out`**. Navigate to
    `http://127.0.0.1:3000/view/sign-in`, sign in with `uat-org-iter11@example.test` /
    `uat-group-pass-11`. **Expect:** navigates to `http://127.0.0.1:3000/view`.

11. **Finalize is BLOCKED while a member is pending (the all-party gate).** Navigate to the
    group URL you recorded in step 5. Click **`Finalize trip`**.
    **Expect:** the group is **NOT** finalized. A note appears reading exactly
    **`Waiting on 1 member: UAT Member.`** and the status badge still says **`Forming`**.

12. **Member confirms.** Click **`Sign out`**. Sign in as the member
    (`uat-mem-iter11@example.test` / `uat-group-pass-11`). Navigate to the group URL. Click
    **`I’m in — confirm`**. **Expect:** the members line updates to **`Members 2/2 confirmed`**.

13. **Finalize succeeds.** Click **`Sign out`**. Sign in as the organizer. Navigate to the group
    URL. Click **`Finalize trip`**.
    **Expect:** the page now shows **`This trip is finalized`** and the status badge reads
    **`Finalized`** (the `Finalize trip` / `I’m in — confirm` buttons are gone).

---

## Pass criteria (ALL must hold)
- Step 3: unverified organizer sees the verify gate, **no create form**.
- Step 7: unverified member sees the verify gate on the invite, **no Join button**.
- Step 8: member joins only after verifying; shows as **Pending**; member has **no Finalize** button.
- Step 11: finalize is **refused** with **`Waiting on 1 member: UAT Member.`**, group stays **Forming**.
- Step 13: after all confirm, finalize succeeds → **`This trip is finalized`** / **`Finalized`**.

If every expectation holds, this is a PASS. If any expected text/state is missing, FAIL and
record which step and what you saw instead (with a screenshot).
