import type { Page } from './types.ts'

/**
 * Built-in pages that ship with the Headless MCP Service.
 *
 * Each page describes a UI capability: a form schema for rendering,
 * a prompt for AI context, and an optional backend request mapping.
 */
export const builtinPages: Page[] = [
  {
    id: 'status',
    pageid: 'system.status',
    description: 'View the current status and health of the harness system',
    prompt:
      'The user wants to check system status. Show them the current health overview.',
    category: 'system',
    schema: {
      type: 'object',
      title: 'System Status',
      description: 'System health overview',
      properties: {
        timeRange: {
          type: 'string',
          title: 'Time Range',
          enum: ['1h', '6h', '24h', '7d'],
          uiWidget: 'select',
        },
      },
      required: [],
    },
    request: {
      method: 'GET',
      url: '/api/system/status',
    },
  },

  {
    id: 'configure',
    pageid: 'system.configure',
    description: 'Configure harness system settings and preferences',
    prompt:
      'The user wants to configure system settings. Help them adjust the configuration.',
    category: 'system',
    schema: {
      type: 'object',
      title: 'System Configuration',
      description: 'Adjust system-level settings',
      properties: {
        logLevel: {
          type: 'string',
          title: 'Log Level',
          enum: ['debug', 'info', 'warn', 'error'],
          uiWidget: 'select',
        },
        maxRetries: {
          type: 'number',
          title: 'Max Retries',
          default: 3,
          uiWidget: 'number',
        },
        enableTelemetry: {
          type: 'boolean',
          title: 'Enable Telemetry',
          default: true,
          uiWidget: 'checkbox',
        },
      },
      required: ['logLevel'],
    },
    request: {
      method: 'POST',
      url: '/api/system/config',
      bodyMapping: {
        log_level: 'logLevel',
        max_retries: 'maxRetries',
        telemetry: 'enableTelemetry',
      },
    },
  },

  {
    id: 'deploy',
    pageid: 'ops.deploy',
    description: 'Deploy an application to a target environment',
    prompt:
      'The user wants to deploy an application. Help them select the app and environment.',
    category: 'ops',
    schema: {
      type: 'object',
      title: 'Deploy Application',
      description: 'Deploy to target environment',
      properties: {
        appName: {
          type: 'string',
          title: 'Application Name',
          uiWidget: 'text',
        },
        environment: {
          type: 'string',
          title: 'Environment',
          enum: ['dev', 'staging', 'production'],
          uiWidget: 'select',
        },
        version: {
          type: 'string',
          title: 'Version (tag or branch)',
          uiWidget: 'text',
        },
        rollbackOnFailure: {
          type: 'boolean',
          title: 'Auto-rollback on failure',
          default: true,
          uiWidget: 'checkbox',
        },
      },
      required: ['appName', 'environment', 'version'],
    },
    request: {
      method: 'POST',
      url: '/api/deploy',
      bodyMapping: {
        app: 'appName',
        env: 'environment',
        version: 'version',
        rollback: 'rollbackOnFailure',
      },
    },
  },

  {
    id: 'inspect-logs',
    pageid: 'ops.logs',
    description: 'Inspect and search application logs',
    prompt:
      'The user wants to inspect logs. Help them filter and search through log data.',
    category: 'ops',
    schema: {
      type: 'object',
      title: 'Log Inspector',
      description: 'Search and filter application logs',
      properties: {
        service: {
          type: 'string',
          title: 'Service',
          uiWidget: 'text',
        },
        level: {
          type: 'string',
          title: 'Minimum Level',
          enum: ['debug', 'info', 'warn', 'error'],
          uiWidget: 'select',
        },
        query: {
          type: 'string',
          title: 'Search Query',
          uiWidget: 'textarea',
        },
        limit: {
          type: 'number',
          title: 'Max Results',
          default: 100,
          uiWidget: 'number',
        },
      },
      required: ['level'],
    },
    request: {
      method: 'POST',
      url: '/api/logs/search',
      bodyMapping: {
        service: 'service',
        level: 'level',
        query: 'query',
        limit: 'limit',
      },
    },
  },
]
