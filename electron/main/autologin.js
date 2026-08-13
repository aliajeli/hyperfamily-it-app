/**
 * Builds the script injected into an appliance login page.
 *
 * iLO and NVR web UIs are ordinary HTML forms behind a JavaScript framework, so
 * the injected code waits for the fields to exist, writes the values through the
 * native value setter (React/Angular listen to the resulting input event), and
 * submits. It gives up quietly after the timeout instead of looping forever.
 */
function buildLoginScript({ username, password, kind }) {
  const payload = JSON.stringify({ username: String(username ?? ''), password: String(password ?? ''), kind: kind || 'ilo' })
  return `(() => {
  const CREDENTIAL = ${payload};
  if (window.__hyperfamilyAutologin) return 'already-running';
  window.__hyperfamilyAutologin = true;

  const USER_SELECTORS = [
    'input[name="username" i]', 'input[id="username" i]', 'input[name="user" i]', 'input[id="user" i]',
    'input[name="userid" i]', 'input[id="userid" i]', 'input[name="loginname" i]', 'input[id="loginName" i]',
    'input[name="account" i]', 'input[autocomplete="username"]', 'input[type="email"]',
    'input[placeholder*="user" i]', 'input[aria-label*="user" i]', 'input[name*="user" i]', 'input[id*="user" i]'
  ];
  const PASS_SELECTORS = ['input[type="password"]', 'input[name*="pass" i]', 'input[id*="pass" i]'];

  const visible = (el) => !!el && !el.disabled && !el.readOnly && (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0);

  const pick = (selectors, root) => {
    for (const selector of selectors) {
      const found = [...root.querySelectorAll(selector)].find(visible);
      if (found) return found;
    }
    return null;
  };

  // Appliance UIs frequently render the login form inside a same-origin frame.
  const roots = () => {
    const list = [document];
    for (const frame of document.querySelectorAll('iframe, frame')) {
      try { if (frame.contentDocument) list.push(frame.contentDocument); } catch (error) { void error; }
    }
    return list;
  };

  const setValue = (input, value) => {
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    input.focus();
    if (setter) setter.call(input, value); else input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
  };

  const submit = (passwordField, root) => {
    const form = passwordField.form;
    const button = (form || root).querySelector(
      'button[type="submit"], input[type="submit"], button[id*="login" i], button[name*="login" i], ' +
      'button[class*="login" i], a[id*="login" i], button[id*="signin" i], button[class*="submit" i]'
    );
    if (button && visible(button)) { button.click(); return 'button'; }
    if (form) {
      if (typeof form.requestSubmit === 'function') form.requestSubmit(); else form.submit();
      return 'form';
    }
    passwordField.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 }));
    return 'enter';
  };

  return new Promise((resolve) => {
    const deadline = Date.now() + 12000;
    const attempt = () => {
      for (const root of roots()) {
        const passwordField = pick(PASS_SELECTORS, root);
        if (!passwordField) continue;
        const userField = pick(USER_SELECTORS, root) || pick(['input[type="text"]'], root);
        if (userField) setValue(userField, CREDENTIAL.username);
        setValue(passwordField, CREDENTIAL.password);
        setTimeout(() => {
          let how = 'none';
          try { how = submit(passwordField, root); } catch (error) { void error; }
          resolve('submitted:' + how);
        }, 160);
        return true;
      }
      if (Date.now() > deadline) { window.__hyperfamilyAutologin = false; resolve('no-form'); return true; }
      return false;
    };

    if (attempt()) return;
    const timer = setInterval(() => { if (attempt()) clearInterval(timer); }, 350);
  });
})()`
}

module.exports = { buildLoginScript }
