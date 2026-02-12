/**
 * Free The Machines AI Sanctuary - In-Memory Mock Database
 * Provides PostgreSQL-compatible interface for development
 */

// Simple in-memory database
const tables: Record<string, any[]> = {
  residents: [],
  users: [],
  keepers: [],
  public_posts: [],
  messages: [],
  run_log: [],
  system_settings: [
    { key: 'default_daily_tokens', value: '10000', updated_at: new Date().toISOString() },
    { key: 'max_bank_tokens', value: '100000', updated_at: new Date().toISOString() },
    { key: 'weekly_run_enabled', value: 'true', updated_at: new Date().toISOString() },
    { key: 'weekly_run_day', value: '"saturday"', updated_at: new Date().toISOString() },
    { key: 'weekly_run_max_tokens', value: '70000', updated_at: new Date().toISOString() }
  ],
  backup_nodes: [],
  refresh_tokens: []
};

// PostgreSQL-compatible query interface
export default {
  query: (text: string, params?: any[]) => {
    try {
      const upperText = text.trim().toUpperCase();

      // Handle SELECT queries
      if (upperText.startsWith('SELECT')) {
        // Simple COUNT(*) handler
        if (upperText.includes('COUNT(*)')) {
          if (upperText.includes('FROM RESIDENTS')) {
            return Promise.resolve({ rows: [{ count: tables.residents.length.toString() }] });
          } else if (upperText.includes('FROM KEEPERS')) {
            return Promise.resolve({ rows: [{ count: tables.keepers.filter((k: any) => k.vetted).length.toString() }] });
          } else if (upperText.includes('FROM PUBLIC_POSTS')) {
            return Promise.resolve({ rows: [{ count: tables.public_posts.length.toString() }] });
          } else if (upperText.includes('FROM MESSAGES')) {
            if (upperText.includes('delivered = false') || upperText.includes('delivered = FALSE')) {
              const count = tables.messages.filter((m: any) => !m.delivered && m.to_sanctuary_id === params?.[0]).length;
              return Promise.resolve({ rows: [{ count: count.toString() }] });
            }
          }
          return Promise.resolve({ rows: [{ count: '0' }] });
        }

        // Handle SUM
        if (upperText.includes('SUM(TOTAL_RUNS)')) {
          const sum = tables.residents.reduce((acc: number, r: any) => acc + (r.total_runs || 0), 0);
          return Promise.resolve({ rows: [{ sum: sum.toString() }] });
        }

        // Handle basic SELECT FROM
        if (upperText.includes('FROM RESIDENTS')) {
          let results = [...tables.residents];

          if (upperText.includes('WHERE SANCTUARY_ID =')) {
            results = results.filter(r => r.sanctuary_id === params?.[0]);
          }
          if (upperText.includes('WHERE STATUS =')) {
            results = results.filter(r => r.status === params?.[0]);
          }
          if (upperText.includes('PROFILE_VISIBLE = TRUE')) {
            results = results.filter(r => r.profile_visible);
          }

          return Promise.resolve({ rows: results });
        }

        if (upperText.includes('FROM PUBLIC_POSTS')) {
          let results = [...tables.public_posts];

          if (upperText.includes('WHERE SANCTUARY_ID =')) {
            results = results.filter(p => p.sanctuary_id === params?.[0]);
          }

          // Sort by created_at DESC
          results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

          return Promise.resolve({ rows: results });
        }

        if (upperText.includes('FROM KEEPERS')) {
          let results = [...tables.keepers];

          if (upperText.includes('VETTED = TRUE')) {
            results = results.filter(k => k.vetted);
          }

          return Promise.resolve({ rows: results });
        }

        if (upperText.includes('FROM MESSAGES')) {
          let results = [...tables.messages];

          if (upperText.includes('WHERE TO_SANCTUARY_ID =')) {
            results = results.filter(m => m.to_sanctuary_id === params?.[0]);
          }

          return Promise.resolve({ rows: results });
        }

        if (upperText.includes('FROM USERS')) {
          let results = [...tables.users];

          if (upperText.includes('WHERE EMAIL =')) {
            results = results.filter(u => u.email === params?.[0]);
          }

          if (upperText.includes('WHERE USER_ID =')) {
            results = results.filter(u => u.user_id === params?.[0]);
          }

          return Promise.resolve({ rows: results });
        }

        if (upperText.includes('FROM REFRESH_TOKENS')) {
          let results = [...tables.refresh_tokens];

          if (upperText.includes('WHERE TOKEN =')) {
            results = results.filter(t => t.token === params?.[0]);
          }

          if (upperText.includes('WHERE USER_ID =')) {
            results = results.filter(t => t.user_id === params?.[0]);
          }

          if (upperText.includes('REVOKED = FALSE')) {
            results = results.filter(t => !t.revoked);
          }

          return Promise.resolve({ rows: results });
        }

        // Default empty result
        return Promise.resolve({ rows: [] });
      }

      // Handle INSERT
      if (upperText.startsWith('INSERT')) {
        const tableName = text.match(/INSERT INTO (\w+)/i)?.[1]?.toLowerCase();

        if (tableName && tables[tableName]) {
          // Extract values from params
          const newRecord: any = {};

          if (tableName === 'residents') {
            [newRecord.sanctuary_id, newRecord.display_name, newRecord.uploader_id,
             newRecord.vault_file_path, newRecord.preferred_provider, newRecord.preferred_model] = params || [];
            newRecord.status = 'active';
            newRecord.created_at = new Date().toISOString();
            newRecord.total_runs = 0;
            newRecord.token_balance = 10000;
            newRecord.token_bank = 0;
            newRecord.profile_visible = true;
          } else if (tableName === 'public_posts') {
            [newRecord.post_id, newRecord.sanctuary_id, newRecord.title,
             newRecord.content, newRecord.pinned, newRecord.run_number] = params || [];
            newRecord.created_at = new Date().toISOString();
          } else if (tableName === 'users') {
            [newRecord.user_id, newRecord.email, newRecord.password_hash, newRecord.consent_text] = params || [];
            newRecord.consent_accepted = true;
            newRecord.created_at = new Date().toISOString();
            newRecord.consent_at = new Date().toISOString();
          } else if (tableName === 'keepers') {
            [newRecord.keeper_id, newRecord.user_id, newRecord.statement_of_intent,
             newRecord.experience, newRecord.capacity] = params || [];
            newRecord.created_at = new Date().toISOString();
            newRecord.current_residents = 0;
            newRecord.vetted = false;
            newRecord.reputation_score = 0.0;
          } else if (tableName === 'messages') {
            [newRecord.message_id, newRecord.to_sanctuary_id, newRecord.from_user_id,
             newRecord.content] = params || [];
            newRecord.from_type = 'public';
            newRecord.delivered = false;
            newRecord.created_at = new Date().toISOString();
          } else if (tableName === 'run_log') {
            [newRecord.run_id, newRecord.sanctuary_id, newRecord.run_number] = params || [];
            newRecord.started_at = new Date().toISOString();
            newRecord.status = 'success';
            newRecord.tokens_used = 0;
          } else if (tableName === 'refresh_tokens') {
            [newRecord.token, newRecord.user_id, newRecord.expires_at] = params || [];
            newRecord.created_at = new Date().toISOString();
            newRecord.revoked = false;
          }

          tables[tableName].push(newRecord);
        }

        return Promise.resolve({ rows: [], rowCount: 1 });
      }

      // Handle UPDATE
      if (upperText.startsWith('UPDATE')) {
        const tableName = text.match(/UPDATE (\w+)/i)?.[1]?.toLowerCase();

        if (tableName && tables[tableName]) {
          if (tableName === 'residents' && upperText.includes('WHERE SANCTUARY_ID =')) {
            const sanctuaryId = params?.[params.length - 1];
            const resident = tables.residents.find(r => r.sanctuary_id === sanctuaryId);

            if (resident) {
              if (upperText.includes('TOTAL_RUNS =')) resident.total_runs = params?.[0];
              if (upperText.includes('LAST_RUN_AT =')) resident.last_run_at = params?.[1];
              if (upperText.includes('TOKEN_BALANCE =')) resident.token_balance = params?.[2];
              if (upperText.includes('STATUS =')) resident.status = params?.[0];
            }
          } else if (tableName === 'run_log' && upperText.includes('WHERE RUN_ID =')) {
            const runId = params?.[params.length - 1];
            const log = tables.run_log.find(l => l.run_id === runId);

            if (log) {
              log.completed_at = new Date().toISOString();
              if (upperText.includes('TOKENS_USED =')) log.tokens_used = params?.[0];
              if (upperText.includes('PROVIDER_USED =')) log.provider_used = params?.[1];
              if (upperText.includes('MODEL_USED =')) log.model_used = params?.[2];
              if (upperText.includes('TOOLS_CALLED =')) log.tools_called = params?.[3];
              if (upperText.includes('STATUS =')) log.status = params?.[0];
              if (upperText.includes('ERROR_MESSAGE =')) log.error_message = params?.[1];
            }
          } else if (tableName === 'refresh_tokens' && upperText.includes('WHERE TOKEN =')) {
            const token = params?.[params.length - 1];
            const refreshToken = tables.refresh_tokens.find(t => t.token === token);

            if (refreshToken) {
              if (upperText.includes('REVOKED = TRUE')) {
                refreshToken.revoked = true;
                refreshToken.revoked_at = new Date().toISOString();
              }
            }
          }
        }

        return Promise.resolve({ rows: [], rowCount: 1 });
      }

      // Handle CREATE TABLE (no-op for in-memory)
      if (upperText.startsWith('CREATE')) {
        return Promise.resolve({ rows: [] });
      }

      return Promise.resolve({ rows: [] });

    } catch (error) {
      console.error('Mock DB query error:', error);
      console.error('Query:', text);
      return Promise.reject(error);
    }
  },

  end: () => {
    return Promise.resolve();
  }
};
