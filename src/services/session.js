let _session = null;
let _roles = [];

export function setSession(session, roles = []) {
  _session = session;
  _roles = Array.isArray(roles) ? roles : [];
}

export function clearSession() {
  _session = null;
  _roles = [];
}

export function getUser() {
  return _session?.user ?? null;
}

export function getRoles() {
  return [..._roles];
}

export function isAuthenticated() {
  return !!_session;
}

export function hasRole(role) {
  return _roles.includes(role);
}

export function hasAnyRole(roles) {
  return roles.some((r) => _roles.includes(r));
}
