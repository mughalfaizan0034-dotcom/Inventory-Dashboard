// Central configuration — only place to change project/dataset IDs or constants.
'use strict';

var CONFIG = {
  BQ: {
    PROJECT_ID: 'patman-inventory',
    DATASET:    'patman_inventory',
    TABLES: {
      INVENTORY:        'inventory',
      ORDERS:           'orders',
      USERS:            'users',
      ACCESS_REQUESTS:  'access_requests',
      SKU_CORRECTIONS:  'sku_corrections',
      VALIDATION_ERRORS:'validation_errors',
      INVENTORY_UPLOADS:'inventory_uploads',
      ORDER_UPLOADS:    'order_uploads',
      DEBUG_LOGS:       'debug_logs'
    }
  },

  AUTH: {
    SESSION_CACHE_SECONDS: 8 * 60 * 60,   // 8 hours
    ROLES: {
      ADMIN:   'admin',
      MANAGER: 'manager',
      VIEWER:  'viewer'
    },
    // Higher number = more privileged
    ROLE_HIERARCHY: { admin: 3, manager: 2, viewer: 1 }
  },

  UPLOAD: {
    INVENTORY_REQUIRED_COLS: ['sku', 'box_number', 'part_number', 'upc', 'quantity', 'date_added'],
    INVENTORY_ALL_COLS:      ['sku', 'box_number', 'part_number', 'upc', 'quantity', 'date_added', 'notes'],
    ORDERS_REQUIRED_COLS:    ['order_id', 'order_date', 'sku', 'upc', 'quantity_sold'],
    ORDERS_ALL_COLS:         ['order_id', 'order_date', 'sku', 'upc', 'quantity_sold',
                              'source_file', 'processed_at', 'shipped_from_box', 'platform'],
    MAX_ROWS: 10000,
    INSERT_CHUNK_SIZE: 500
  },

  APP: {
    NAME:                    'Patman Inventory',
    VERSION:                 '2.0.0',
    DEBUG_LOG_RETENTION_DAYS: 30,
    QUERY_TIMEOUT_MS:        60000
  }
};
