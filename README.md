# TO DO

A to-do list with accounts, tasks, priority colours and subtasks.
It's a static HTML/JavaScript app that uses [Supabase](https://supabase.com) for sign-up, login and the database, so it runs on GitHub Pages with no server or PHP.

This is a rewrite of the original CodeIgniter/PHP + MySQL version.

## Features

- Sign up, sign in and sign out (Supabase Auth). Users stay signed in on their device.
- Tasks: add, edit, mark done / not done, delete, delete all.
- Priority colours: casual, critical, priority, mediumpriority, important, deadline, notcritical.
- Subtasks for each task: add, mark done / not done, delete, delete all.
- A task can't be marked done or deleted while it still has unfinished subtasks.
- Each user can only see and change their own tasks. This is enforced in the database by Row Level Security.

## Setup

### 1. Create the Supabase project

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
3. Open **Project Settings → API Keys** and copy the **Project URL** (`https://<project-ref>.supabase.co`, not a dashboard link) and the **publishable** key (`sb_publishable_…`, or the legacy **anon public** key).
4. Put them in [`config.js`](config.js).

The publishable key is meant for browser code and is safe to commit. **Never** use a secret key (`sb_secret_…`) or the `service_role` key here: they bypass all security rules, and `config.js` is public.

### 2. Set the sign-up redirect URL

By default, Supabase asks new users to confirm their e-mail.
The link in that e-mail must point at your site:

- Go to **Authentication → URL Configuration**.
- Set **Site URL** to your GitHub Pages address, for example `https://<your-username>.github.io/<repo-name>/`.
- Add the same address, plus `http://localhost:8080/` for local testing, under **Redirect URLs**.

To skip e-mail confirmation while testing, turn off **Confirm email** under **Authentication → Sign In / Providers → Email**.

### 3. Run it locally

Any static file server works, for example:

```bash
python -m http.server 8080
```

Then open http://localhost:8080/.

### 4. Publish on GitHub Pages

1. Push this folder to a GitHub repository.
2. In the repository, go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, pick `main` and `/ (root)`, and save.
4. After a minute the site is live at `https://<your-username>.github.io/<repo-name>/`.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page shell. Loads the Supabase client, `config.js` and `app.js`. |
| `app.js` | All app logic: routing, pages, sign-in, task and subtask actions. |
| `styles.css` | Styles, ported from the original app. |
| `config.js` | Your Supabase project URL and publishable key. |
| `supabase/schema.sql` | Database tables and security rules. Run once in Supabase. |
| `assets/Laptop.jpg` | Background image. |

## Changes from the PHP version

- Login is by e-mail and password. The username is still collected at sign-up and stored with the account.
- Fixed SQL injection: the old app built every query from raw user input.
- Fixed missing ownership checks: the old app let any logged-in user edit or delete anyone's tasks by changing the ID in the URL.
- Fixed the subtasks page crash: the old code used a `colour` column the `subitems` table didn't have.
- Subtask counts are calculated live instead of stored in a separate column.
- Removed the broken subtask "Edit" link, which pointed to a page that didn't exist.
- "Delete All" now asks for confirmation.
