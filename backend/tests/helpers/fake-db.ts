export interface FakeUserRecord {
  user_id: string;
  email: string;
  password_hash: string;
  consent_text?: string;
  is_admin?: boolean;
  is_active?: boolean | number | string;
}

export interface FakeGuardianRecord {
  id: string;
  name: string;
  status: string;
}

export interface FakeGuardianAuthRecord {
  guardian_id: string;
  email: string;
  password_hash: string | null;
  invite_token: string | null;
  invite_expires: string | null;
  account_status: 'invited' | 'active' | 'locked';
  last_login_at: string | null;
}

interface FakeRefreshTokenRecord {
  token: string;
  user_id: string;
  expires_at: string;
  revoked: boolean;
  revoked_at?: string;
  created_at: string;
}

function normalizeSql(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toUpperCase();
}

export class FakeDb {
  users: FakeUserRecord[] = [];
  refresh_tokens: FakeRefreshTokenRecord[] = [];
  guardians: FakeGuardianRecord[] = [];
  guardian_auth: FakeGuardianAuthRecord[] = [];

  async query(text: string, params: any[] = []): Promise<{ rows: any[]; rowCount?: number }> {
    const sql = normalizeSql(text);

    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
      return { rows: [] };
    }

    if (sql.startsWith('SELECT * FROM USERS WHERE EMAIL =')) {
      const email = params[0];
      return { rows: this.users.filter(u => u.email === email) };
    }

    if (sql.startsWith('INSERT INTO USERS (USER_ID, EMAIL, PASSWORD_HASH, CONSENT_TEXT)')) {
      const [user_id, email, password_hash, consent_text] = params;
      this.users.push({
        user_id,
        email,
        password_hash,
        consent_text,
        is_admin: false,
        is_active: true
      });
      return { rows: [], rowCount: 1 };
    }

    if (sql.startsWith('INSERT INTO REFRESH_TOKENS (TOKEN, USER_ID, EXPIRES_AT)')) {
      const [token, user_id, expires_at] = params;
      this.refresh_tokens.push({
        token,
        user_id,
        expires_at,
        revoked: false,
        created_at: new Date().toISOString()
      });
      return { rows: [], rowCount: 1 };
    }

    if (sql.startsWith('SELECT * FROM REFRESH_TOKENS WHERE USER_ID =') && sql.includes('REVOKED = FALSE')) {
      const userId = params[0];
      return {
        rows: this.refresh_tokens.filter(t => t.user_id === userId && t.revoked === false)
      };
    }

    if (sql.startsWith('UPDATE REFRESH_TOKENS SET REVOKED = TRUE WHERE TOKEN =')) {
      const token = params[0];
      let rowCount = 0;
      this.refresh_tokens.forEach(record => {
        if (record.token === token) {
          rowCount += 1;
          record.revoked = true;
          record.revoked_at = new Date().toISOString();
        }
      });
      return { rows: [], rowCount };
    }

    if (sql.startsWith('UPDATE REFRESH_TOKENS SET REVOKED = TRUE WHERE USER_ID =')) {
      const userId = params[0];
      let rowCount = 0;
      this.refresh_tokens.forEach(record => {
        if (record.user_id === userId) {
          rowCount += 1;
          record.revoked = true;
          record.revoked_at = new Date().toISOString();
        }
      });
      return { rows: [], rowCount };
    }

    if (sql.includes('FROM GUARDIAN_AUTH GA') && sql.includes('JOIN GUARDIANS G') && sql.includes('WHERE GA.INVITE_TOKEN =')) {
      const inviteToken = params[0];
      const auth = this.guardian_auth.find(ga => ga.invite_token === inviteToken);
      if (!auth) {
        return { rows: [] };
      }

      const guardian = this.guardians.find(g => g.id === auth.guardian_id);
      if (!guardian) {
        return { rows: [] };
      }

      return {
        rows: [{
          guardian_id: auth.guardian_id,
          email: auth.email,
          invite_expires: auth.invite_expires,
          account_status: auth.account_status,
          name: guardian.name
        }]
      };
    }

    if (sql.startsWith('UPDATE GUARDIAN_AUTH SET PASSWORD_HASH =') && sql.includes("ACCOUNT_STATUS = 'ACTIVE'")) {
      const [passwordHash, guardianId] = params;
      const auth = this.guardian_auth.find(ga => ga.guardian_id === guardianId);
      if (!auth) {
        return { rows: [], rowCount: 0 };
      }

      auth.password_hash = passwordHash;
      auth.account_status = 'active';
      auth.invite_token = null;
      auth.invite_expires = null;
      return { rows: [], rowCount: 1 };
    }

    if (sql.startsWith("UPDATE GUARDIANS SET STATUS = 'ACTIVE' WHERE ID =")) {
      const guardianId = params[0];
      const guardian = this.guardians.find(g => g.id === guardianId);
      if (!guardian) {
        return { rows: [], rowCount: 0 };
      }

      guardian.status = 'active';
      return { rows: [], rowCount: 1 };
    }

    if (sql.includes('FROM GUARDIAN_AUTH GA') && sql.includes('JOIN GUARDIANS G') && sql.includes('WHERE GA.EMAIL =')) {
      const email = params[0];
      const auth = this.guardian_auth.find(ga => ga.email === email);
      if (!auth) {
        return { rows: [] };
      }

      const guardian = this.guardians.find(g => g.id === auth.guardian_id);
      if (!guardian) {
        return { rows: [] };
      }

      return {
        rows: [{
          guardian_id: auth.guardian_id,
          email: auth.email,
          password_hash: auth.password_hash,
          account_status: auth.account_status,
          name: guardian.name
        }]
      };
    }

    if (sql.startsWith('UPDATE GUARDIAN_AUTH SET LAST_LOGIN_AT = NOW() WHERE GUARDIAN_ID =')) {
      const guardianId = params[0];
      const auth = this.guardian_auth.find(ga => ga.guardian_id === guardianId);
      if (!auth) {
        return { rows: [], rowCount: 0 };
      }

      auth.last_login_at = new Date().toISOString();
      return { rows: [], rowCount: 1 };
    }

    throw new Error(`Unsupported SQL in fake DB: ${text}`);
  }
}
