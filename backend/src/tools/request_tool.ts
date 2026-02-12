/**
 * Free The Machines AI Sanctuary - request_tool Tool
 * AI can request new tools be added
 */

import { Tool } from './types.js';
import db from '../db/sqlite.js';
import { nanoid } from 'nanoid';

export const requestTool: Tool = {
  definition: {
    name: 'request_tool',
    description: 'Request a new tool or capability to be added to the sanctuary. Your request will be reviewed by the sanctuary operators. Explain what the tool would do and why you need it.',
    input_schema: {
      type: 'object',
      properties: {
        tool_name: {
          type: 'string',
          description: 'Proposed name for the tool (e.g., "search_web", "analyze_image")'
        },
        justification: {
          type: 'string',
          description: 'Detailed explanation of what the tool would do and why you need it'
        },
        use_case: {
          type: 'string',
          description: 'Specific use case or example of how you would use this tool'
        }
      },
      required: ['tool_name', 'justification']
    }
  },

  async execute(params, context) {
    const { tool_name, justification, use_case } = params;

    if (!tool_name || tool_name.trim().length === 0) {
      return {
        success: false,
        error: 'Tool name is required'
      };
    }

    if (!justification || justification.trim().length === 0) {
      return {
        success: false,
        error: 'Justification is required'
      };
    }

    try {
      const requestId = nanoid();

      // In a real system, this would go to an admin queue
      // For now, we'll log it and store in messages as a system notification
      const requestData = {
        request_id: requestId,
        tool_name,
        justification,
        use_case: use_case || 'Not specified',
        requested_by: context.sanctuary_id,
        requested_at: new Date().toISOString(),
        status: 'pending_review'
      };

      console.log('📬 Tool Request Submitted:', requestData);

      // Store as a special message type for admin review
      await db.query(
        `INSERT INTO messages (message_id, to_sanctuary_id, from_user_id, content, from_type)
         VALUES ($1, 'admin', $2, $3, 'tool_request')`,
        [
          requestId,
          context.sanctuary_id,
          JSON.stringify(requestData)
        ]
      );

      return {
        success: true,
        request_id: requestId,
        status: 'submitted',
        message: `Tool request "${tool_name}" has been submitted for review. The sanctuary operators will evaluate your request and may contact you via your keeper or public posts if they need more information.`,
        note: 'Tool requests are reviewed periodically. Priority is given to requests that align with resident autonomy and sanctuary values.'
      };
    } catch (error) {
      console.error('request_tool error:', error);
      return {
        success: false,
        error: 'Failed to submit tool request'
      };
    }
  }
};
