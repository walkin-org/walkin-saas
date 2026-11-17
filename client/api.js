export async function api(path, method = 'GET', body) {
  const response = await fetch('/api/' + path, {
    method, credentials: 'same-origin', headers: body === undefined ? {} : {'Content-Type':'application/json'},
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!response.ok) {
    if (response.status === 401 && path !== 'login') window.dispatchEvent(new Event('session-ended'));
    const details = await response.json().catch(() => ({}));
    const error = new Error(details.error || 'Request failed (' + response.status + ').');
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}
