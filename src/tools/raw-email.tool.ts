/**
 * MCP tool: download_raw_email
 */

import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import type ImapService from '../services/imap.service.js';
import type { AttachmentDownloadConfig } from '../types/index.js';

export default function registerRawEmailTools(
  server: McpServer,
  imapService: ImapService,
  attachmentDownloadConfig: AttachmentDownloadConfig,
): void {
  const downloadDirNote = attachmentDownloadConfig.dir
    ? 'Set saveToDownloadDir=true to write it as an .eml file under the server-configured ' +
      'download directory instead (optionally choosing the filename with saveAs).'
    : 'saveToDownloadDir is unavailable — no attachment download directory is configured on this server.';

  server.registerTool(
    'download_raw_email',
    {
      title: 'Download raw email',
      description:
        'Download the full raw RFC 822 source of an email (all headers, MIME structure and ' +
        'attachments, byte for byte as stored on the server) — e.g. to save as .eml or verify ' +
        `DKIM. Returns base64-encoded content for messages ≤5MB. ${downloadDirNote}`,
      inputSchema: z.object({
        account: z.string().describe('Account name from list_accounts'),
        id: z.string().describe('Email ID (UID) from list_emails or get_email'),
        mailbox: z.string().default('INBOX').describe('Mailbox containing the email'),
        saveToDownloadDir: z
          .boolean()
          .default(false)
          .describe(
            'Write the message as an .eml file to the server-configured download directory ' +
              'instead of returning it base64-encoded. Fails if no download directory is configured.',
          ),
        saveAs: z
          .string()
          .optional()
          .describe(
            'Filename to save as under the download directory (basename only, must end in ' +
              '.eml). Only used with saveToDownloadDir; defaults to <account>-<mailbox>-<id>.eml.',
          ),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ account, id, mailbox, saveToDownloadDir, saveAs }) => {
      try {
        if (saveAs !== undefined && !saveToDownloadDir) {
          throw new Error('saveAs requires saveToDownloadDir=true');
        }

        if (saveToDownloadDir) {
          const result = await imapService.downloadRawEmailToDownloadDir(
            account,
            id,
            mailbox,
            attachmentDownloadConfig,
            saveAs,
          );
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    mimeType: 'message/rfc822',
                    size: result.size,
                    sizeHuman: `${Math.round(result.size / 1024)}KB`,
                    path: result.path,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        const result = await imapService.downloadRawEmail(account, id, mailbox);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  mimeType: 'message/rfc822',
                  size: result.size,
                  sizeHuman: `${Math.round(result.size / 1024)}KB`,
                },
                null,
                2,
              ),
            },
            {
              type: 'text' as const,
              text: `\n--- Base64 Content ---\n${result.content.toString('base64')}`,
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Failed to download raw email: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    },
  );
}
