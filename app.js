// To-Do List: browser app backed by Supabase (auth + Postgres).
// Replaces the CodeIgniter controllers (welcome.php, work.php, worksub.php) and models.
//
// Routes (hash based, so it works on GitHub Pages):
//   #/            signed-out home            (was welcome/index)
//   #/signup      sign-up form               (was welcome/signupform)
//   #/tasks       task list                  (was work/index)
//   #/edit/:id    edit a task                (was work/edit/:id)
//   #/task/:id    subtasks of a task         (was worksub, via work/subtask/:id)

const COLOURS = ['casual', 'critical', 'priority', 'mediumpriority', 'important', 'deadline', 'notcritical'];

const app = document.getElementById('app');
const cfg = window.TODO_CONFIG || {};
const configured =
  typeof cfg.SUPABASE_URL === 'string' && /^https:\/\/.+/.test(cfg.SUPABASE_URL) &&
  typeof cfg.SUPABASE_ANON_KEY === 'string' && cfg.SUPABASE_ANON_KEY.length > 20 &&
  !cfg.SUPABASE_ANON_KEY.includes('YOUR_');

let sb = null;
let session = null;
let flash = null;        // { text, error } shown once on the next page render
let renderSeq = 0;       // guards against out-of-order async renders

// ---------------------------------------------------------------- helpers

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const go = (path) => {
  if (location.hash === '#/' + path) render();
  else location.hash = '#/' + path;
};

const setFlash = (text, error = false) => { flash = { text, error }; };

const takeFlash = () => {
  if (!flash) return '';
  const html = `<p class="flash${flash.error ? ' error' : ''}" role="status">${esc(flash.text)}</p>`;
  flash = null;
  return html;
};

const colourOptions = (selected = 'casual') =>
  COLOURS.map((c) => `<option value="${c}"${c === selected ? ' selected' : ''}>${c}</option>`).join('');

const userName = () => {
  const m = session?.user?.user_metadata || {};
  const full = [m.first_name, m.last_name].filter(Boolean).join(' ');
  return full || m.username || session?.user?.email || '';
};

const fail = (error, fallback = 'Something went wrong. Please try again.') => {
  console.error(error);
  setFlash(error?.message || fallback, true);
};

// Returns true when the task still has unfinished subtasks (was tasks_model->subinteract).
async function hasPendingSubtasks(itemId) {
  const { count, error } = await sb.from('subitems')
    .select('id', { count: 'exact', head: true })
    .eq('item_id', itemId).eq('done', false);
  if (error) throw error;
  return count > 0;
}

// ---------------------------------------------------------------- layout pieces

const headerSignedOut = () => `
  <header><nav class="nav">
    <a class="home" href="#/">Home</a>
    <div class="nav-login">
      <form data-form="login">
        <input type="email" name="email" placeholder="E-mail" autocomplete="username" required aria-label="E-mail">
        <input type="password" name="password" placeholder="Password" autocomplete="current-password" required aria-label="Password">
        <button type="submit">Sign In</button>
      </form>
      <a class="link-btn" href="#/signup">Sign up</a>
    </div>
  </nav></header>`;

const headerSignedIn = () => `
  <header><nav class="nav">
    <a class="home" href="#/tasks">Home</a>
    <div class="nav-login">
      <span class="nav-user">${esc(session.user.email)}</span>
      <button type="button" data-action="logout">Sign Out</button>
    </div>
  </nav></header>`;

const addForm = (formName, placeholder) => `
  <form class="item-add" data-form="${formName}">
    <input class="input" type="text" name="name" placeholder="${placeholder}" autocomplete="off" maxlength="1000" required aria-label="${placeholder}">
    <select name="colour" aria-label="Priority">${colourOptions()}</select>
    <button type="submit" class="submit">Add New</button>
  </form>`;

// ---------------------------------------------------------------- pages

const pages = {
  async home() {
    const msg = takeFlash();
    return `${headerSignedOut()}
      <section class="main-container">
        ${msg}
        <h2>${msg ? '' : '"Please Sign In or Sign Up!"'}</h2>
      </section>`;
  },

  async signup() {
    return `${headerSignedOut()}
      <section class="main-container">
        <h2>Signup</h2>
        ${takeFlash()}
        <form class="signup-form" data-form="signup">
          <input type="text" name="first" placeholder="Firstname" autocomplete="given-name" required aria-label="First name">
          <input type="text" name="last" placeholder="Lastname" autocomplete="family-name" required aria-label="Last name">
          <input type="email" name="email" placeholder="E-mail" autocomplete="email" required aria-label="E-mail">
          <input type="text" name="username" placeholder="Username" autocomplete="nickname" required aria-label="Username">
          <input type="password" name="password" placeholder="Password (min 6 characters)" autocomplete="new-password" minlength="6" required aria-label="Password">
          <button type="submit">Sign Up</button>
        </form>
      </section>`;
  },

  async tasks() {
    const { data: items, error } = await sb.from('items')
      .select('id, name, done, colour, created_at, subitems(count)')
      .order('created_at', { ascending: true });
    if (error) throw error;

    const rows = items.map((i) => {
      const subs = i.subitems?.[0]?.count ?? 0;
      return `<li>
        <span class="label ${i.colour}${i.done ? ' done' : ''}">
          <span class="text">${esc(i.name)}</span>
          <span class="meta">(${subs} subtask${subs === 1 ? '' : 's'} · ${i.colour})</span>
        </span>
        <button class="done-button" data-action="${i.done ? 'unmark' : 'mark'}" data-id="${i.id}">${i.done ? 'Not Yet Done' : 'Mark As Done'}</button>
        ${i.done ? '' : `
          <a class="done-button" href="#/task/${i.id}">Subtask</a>
          <a class="done-button" href="#/edit/${i.id}">Edit</a>`}
        <button class="done-button" data-action="delete" data-id="${i.id}">Delete</button>
      </li>`;
    }).join('');

    return `${headerSignedIn()}
      <section>
        <h1 class="head">${esc(userName())}</h1>
        ${takeFlash()}
        <div class="list">
          <h1 class="header">TASKS.</h1>
          ${items.length ? `<ul class="items">${rows}</ul>` : '<p class="empty">No tasks yet. Add one below.</p>'}
          ${addForm('add-task', 'Type a new item.')}
          ${items.length ? `<div class="delbutton"><button class="formbtn" data-action="delete-all">Delete All</button></div>` : ''}
        </div>
      </section>`;
  },

  async edit(id) {
    const { data: item, error } = await sb.from('items')
      .select('id, name, colour').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!item) { setFlash('That task no longer exists.', true); return go('tasks'); }

    return `${headerSignedIn()}
      <section>
        <h1 class="head">Edit Here</h1>
        ${takeFlash()}
        <div class="list">
          <form class="item-add" data-form="edit-task" data-id="${item.id}">
            <input class="input" type="text" name="name" value="${esc(item.name)}" autocomplete="off" maxlength="1000" required aria-label="Task name">
            <select name="colour" aria-label="Priority">${colourOptions(item.colour)}</select>
            <button type="submit" class="submit">Update</button>
          </form>
        </div>
        <div class="back"><a class="formbtn" href="#/tasks">Cancel</a></div>
      </section>`;
  },

  async task(id) {
    const [{ data: parent, error: e1 }, { data: subs, error: e2 }] = await Promise.all([
      sb.from('items').select('id, name').eq('id', id).maybeSingle(),
      sb.from('subitems').select('id, subtask, done, colour').eq('item_id', id).order('created_at', { ascending: true }),
    ]);
    if (e1 || e2) throw e1 || e2;
    if (!parent) { setFlash('That task no longer exists.', true); return go('tasks'); }

    const rows = subs.map((s) => `<li>
        <span class="label ${s.colour}${s.done ? ' done' : ''}">
          <span class="text">${esc(s.subtask)}</span>
          <span class="meta">(${s.colour})</span>
        </span>
        <button class="done-button" data-action="${s.done ? 'unmark-sub' : 'mark-sub'}" data-id="${s.id}">${s.done ? 'Not Yet Done' : 'Mark As Done'}</button>
        <button class="done-button" data-action="delete-sub" data-id="${s.id}">Delete</button>
      </li>`).join('');

    return `${headerSignedIn()}
      <section>
        <h1 class="head">${esc(userName())}</h1>
        ${takeFlash()}
        <div class="list">
          <h1 class="header">SUBTASKS OF “${esc(parent.name)}”.</h1>
          ${subs.length ? `<ul class="items">${rows}</ul>` : '<p class="empty">No subtasks yet.</p>'}
          <form class="item-add" data-form="add-sub" data-parent="${parent.id}">
            <input class="input" type="text" name="name" placeholder="Type a new subtask." autocomplete="off" maxlength="1000" required aria-label="New subtask">
            <select name="colour" aria-label="Priority">${colourOptions()}</select>
            <button type="submit" class="submit">Add New</button>
          </form>
          ${subs.length ? `<div class="delbutton"><button class="formbtn" data-action="delete-all-sub" data-parent="${parent.id}">Delete All</button></div>` : ''}
        </div>
        <div class="back"><a class="formbtn" href="#/tasks">Parent Task</a></div>
      </section>`;
  },
};

// ---------------------------------------------------------------- router

function parseRoute() {
  const [name = '', id] = location.hash.replace(/^#\/?/, '').split('/');
  return { name, id: id ? Number(id) : null };
}

async function render() {
  if (!configured) return renderSetup();

  const seq = ++renderSeq;
  const { name, id } = parseRoute();
  const signedIn = !!session;
  const authPages = ['tasks', 'edit', 'task'];

  // Access rules (were the controller constructors' session checks).
  if (authPages.includes(name) && !signedIn) return go('');
  if (!authPages.includes(name) && signedIn) return go('tasks');
  if ((name === 'edit' || name === 'task') && !Number.isInteger(id)) return go('tasks');

  const page = { '': 'home', signup: 'signup', tasks: 'tasks', edit: 'edit', task: 'task' }[name];
  if (!page) return go(signedIn ? 'tasks' : '');

  if (authPages.includes(name) && !app.innerHTML.trim()) app.innerHTML = '<p class="loading">Loading…</p>';

  try {
    const html = await pages[page](id);
    if (seq !== renderSeq || typeof html !== 'string') return; // a newer render took over
    app.innerHTML = html;
  } catch (err) {
    if (seq !== renderSeq) return;
    fail(err);
    app.innerHTML = `${signedIn ? headerSignedIn() : headerSignedOut()}${takeFlash()}`;
  }
}

function renderSetup() {
  app.innerHTML = `<div class="setup">
    <h1>Almost there: connect Supabase</h1>
    <p>This app stores accounts and tasks in Supabase. To finish setting it up:</p>
    <ol>
      <li>Create a free project at <a href="https://supabase.com" target="_blank" rel="noopener">supabase.com</a>.</li>
      <li>In the project, open <b>SQL Editor</b>, paste the contents of <code>supabase/schema.sql</code> and click <b>Run</b>.</li>
      <li>Open <b>Project Settings → API</b> and copy the <b>Project URL</b> and the <b>anon public</b> key.</li>
      <li>Paste them into <code>config.js</code> and reload this page.</li>
    </ol>
  </div>`;
}

// ---------------------------------------------------------------- form handlers

const forms = {
  async login(d) {
    const { error } = await sb.auth.signInWithPassword({ email: d.email.trim(), password: d.password });
    if (error) {
      setFlash(/confirm/i.test(error.message)
        ? 'Please confirm your e-mail first (check your inbox), then sign in.'
        : 'Wrong e-mail or password.', true);
      return go('');
    }
    setFlash('You are signed in !!');
    // onAuthStateChange re-renders and routes to #/tasks.
  },

  async signup(d) {
    const { data, error } = await sb.auth.signUp({
      email: d.email.trim(),
      password: d.password,
      options: {
        data: { first_name: d.first.trim(), last_name: d.last.trim(), username: d.username.trim() },
        emailRedirectTo: location.origin + location.pathname,
      },
    });
    if (error) { setFlash(error.message, true); return go('signup'); }
    if (data.session) { setFlash('You have successfully signed up !!'); return; }
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      setFlash('An account with that e-mail already exists. Please sign in.', true);
      return go('');
    }
    setFlash('You have successfully signed up !! Check your e-mail to confirm your account, then sign in.');
    go('');
  },

  async 'add-task'(d) {
    const name = d.name.trim();
    if (!name) return;
    const { error } = await sb.from('items').insert({ name, colour: d.colour });
    if (error) fail(error);
    render();
  },

  async 'edit-task'(d, form) {
    const name = d.name.trim();
    if (!name) return;
    const { error } = await sb.from('items').update({ name, colour: d.colour }).eq('id', Number(form.dataset.id));
    if (error) fail(error); else setFlash('Item has been updated!!');
    go('tasks');
  },

  async 'add-sub'(d, form) {
    const subtask = d.name.trim();
    if (!subtask) return;
    const { error } = await sb.from('subitems').insert({ item_id: Number(form.dataset.parent), subtask, colour: d.colour });
    if (error) fail(error);
    render();
  },
};

// ---------------------------------------------------------------- button actions

const actions = {
  async logout() {
    await sb.auth.signOut();
    setFlash('You have signed out !!');
  },

  async mark(id) {
    if (await hasPendingSubtasks(id)) { setFlash('You have pending subtasks !!', true); return; }
    const { error } = await sb.from('items').update({ done: true }).eq('id', id);
    if (error) throw error;
  },

  async unmark(id) {
    const { error } = await sb.from('items').update({ done: false }).eq('id', id);
    if (error) throw error;
  },

  async delete(id) {
    if (await hasPendingSubtasks(id)) { setFlash('You have pending subtasks !!', true); return; }
    const { error } = await sb.from('items').delete().eq('id', id);
    if (error) throw error;
  },

  async 'delete-all'() {
    if (!confirm('Delete ALL your tasks and their subtasks? This cannot be undone.')) return;
    const { error } = await sb.from('items').delete().eq('user_id', session.user.id);
    if (error) throw error;
  },

  async 'mark-sub'(id) {
    const { error } = await sb.from('subitems').update({ done: true }).eq('id', id);
    if (error) throw error;
  },

  async 'unmark-sub'(id) {
    const { error } = await sb.from('subitems').update({ done: false }).eq('id', id);
    if (error) throw error;
  },

  async 'delete-sub'(id) {
    const { error } = await sb.from('subitems').delete().eq('id', id);
    if (error) throw error;
  },

  async 'delete-all-sub'(_id, el) {
    if (!confirm('Delete all subtasks of this task?')) return;
    const { error } = await sb.from('subitems').delete().eq('item_id', Number(el.dataset.parent));
    if (error) throw error;
  },
};

// ---------------------------------------------------------------- wiring

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form || !forms[form.dataset.form]) return;
  e.preventDefault();
  const buttons = form.querySelectorAll('button');
  buttons.forEach((b) => (b.disabled = true));
  try {
    await forms[form.dataset.form](Object.fromEntries(new FormData(form)), form);
  } catch (err) {
    fail(err);
    render();
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
});

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || !actions[el.dataset.action]) return;
  e.preventDefault();
  el.disabled = true;
  try {
    await actions[el.dataset.action](Number(el.dataset.id), el);
  } catch (err) {
    fail(err);
  }
  if (el.dataset.action !== 'logout') render(); // logout re-renders via onAuthStateChange
});

window.addEventListener('hashchange', render);

if (configured) {
  sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  // Fires once on load with the saved session (so users stay signed in), and on every sign-in / sign-out.
  sb.auth.onAuthStateChange((_event, newSession) => {
    const changed = !!newSession !== !!session;
    session = newSession;
    if (changed || _event === 'INITIAL_SESSION') setTimeout(render, 0); // don't call Supabase inside this callback
  });
} else {
  render();
}
