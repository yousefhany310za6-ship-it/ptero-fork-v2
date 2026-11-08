// Every object here is what the running panel actually answered for the matching endpoint, with
// names, addresses and identifiers replaced. It is the screen test's stand-in for the API: a
// screen that reads a field the server does not send stops the build.
import type { Overview, Servers, ServerDetail, Nodes, NodeDetail, Resources, Customers, Network, Security, Incidents, StatusReport } from '../api';

export const overview: Overview = {
    "range": {
        "label": "30d",
        "from": "2026-10-06T19:02:08+03:00",
        "to": "2026-11-05T18:02:08+02:00",
        "tier": "hour",
        "bucket": 14400,
        "seconds": 2592000,
        "windows": [
            "15m",
            "1h",
            "6h",
            "24h",
            "7d",
            "30d",
            "90d"
        ]
    },
    "live": {
        "running": 0,
        "total": 1
    },
    "fleet": {
        "points": [
            {
                "t": 1793779200,
                "servers": 1,
                "samples": 13,
                "cpu": 0,
                "cpu_peak": 0,
                "memory": 0,
                "memory_peak": 0,
                "rx": 0,
                "tx": 0,
                "up": 0,
                "restarts": 0
            },
            {
                "t": 1793793600,
                "servers": 1,
                "samples": 41,
                "cpu": 0,
                "cpu_peak": 0,
                "memory": 0,
                "memory_peak": 0,
                "rx": 0,
                "tx": 0,
                "up": 0,
                "restarts": 0
            }
        ],
        "totals": {
            "points": 2,
            "samples": 54,
            "cpu": 0,
            "cpu_peak": 0,
            "memory": 0,
            "memory_peak": 0,
            "disk_peak": null,
            "up": 0,
            "restarts": 0,
            "rx": 0,
            "tx": 0
        }
    },
    "busiest": [
        {
            "server_id": 1,
            "name": "Example",
            "short_id": "f32175ff",
            "node_id": 2,
            "memory_limit": 1024,
            "disk_limit": 2048,
            "cpu_limit": 100,
            "samples": 54,
            "cpu": 0,
            "cpu_peak": 0,
            "memory": 0,
            "memory_peak": 0,
            "disk": 0,
            "rx_bytes": 0,
            "tx_bytes": 0,
            "up": 0,
            "restarts": 0
        }
    ],
    "nodes": [
        {
            "id": 2,
            "name": "Example-1",
            "fqdn": "node.example",
            "maintenance": false,
            "memory_total": 4096,
            "disk_total": 51200,
            "servers": 1,
            "cpu_allocated": 100,
            "memory_allocated": 1024,
            "disk_allocated": 2048,
            "cpu": 71.33,
            "load1": 4.64,
            "memory_used": 2810,
            "disk_used": 15497,
            "running": 0,
            "reachable": true,
            "sampled_at": "2026-11-05 18:01:00"
        }
    ],
    "census": {
        "users_total": 2,
        "users_admin": 1,
        "users_2fa": 0,
        "servers_total": 1,
        "servers_suspended": 0,
        "servers_installing": 0,
        "nodes_total": 1,
        "allocations_total": 4,
        "allocations_used": 1,
        "memory_allocated": 1024,
        "disk_allocated": 2048,
        "cpu_allocated": 100
    },
    "http": {
        "points": [
            {
                "t": 1793707200,
                "requests": 5,
                "errors_4xx": 0,
                "errors_5xx": 0
            },
            {
                "t": 1793721600,
                "requests": 49,
                "errors_4xx": 9,
                "errors_5xx": 0
            },
            {
                "t": 1793736000,
                "requests": 42,
                "errors_4xx": 7,
                "errors_5xx": 0
            }
        ],
        "requests": 16365,
        "errors_4xx": 201,
        "errors_5xx": 44
    },
    "events": {
        "totals": [
            {
                "event": "auth:success",
                "occurrences": 68
            },
            {
                "event": "server:file.read",
                "occurrences": 22
            },
            {
                "event": "server:startup.edit",
                "occurrences": 8
            }
        ],
        "series": [
            {
                "t": 1793664000,
                "event": "auth:success",
                "occurrences": 1
            },
            {
                "t": 1793779200,
                "event": "auth:success",
                "occurrences": 4
            }
        ]
    },
    "incidents": {
        "open": 0,
        "resolved": 0,
        "servers": 0,
        "nodes": 0
    },
    "health": {
        "collecting": true,
        "level": "full",
        "reasons": [],
        "last_pass_at": "2026-11-05 18:01:07",
        "warnings": [],
        "generated_at": "2026-11-05T18:02:07+02:00"
    }
};

export const servers: Servers = {
    "range": {
        "label": "30d",
        "from": "2026-10-06T19:02:08+03:00",
        "to": "2026-11-05T18:02:08+02:00",
        "tier": "hour",
        "bucket": 14400,
        "seconds": 2592000,
        "windows": [
            "15m",
            "1h",
            "6h",
            "24h",
            "7d",
            "30d",
            "90d"
        ]
    },
    "servers": [
        {
            "server_id": 1,
            "name": "Example",
            "short_id": "f32175ff",
            "node_id": 2,
            "memory_limit": 1024,
            "disk_limit": 2048,
            "cpu_limit": 100,
            "samples": 54,
            "cpu": 0,
            "cpu_peak": 0,
            "memory": 0,
            "memory_peak": 0,
            "disk": 0,
            "rx_bytes": 0,
            "tx_bytes": 0,
            "up": 0,
            "restarts": 0
        }
    ],
    "nodes": [
        {
            "id": 2,
            "name": "Example-1",
            "fqdn": "node.example",
            "maintenance": false,
            "memory_total": 4096,
            "disk_total": 51200,
            "servers": 1,
            "cpu_allocated": 100,
            "memory_allocated": 1024,
            "disk_allocated": 2048,
            "cpu": 71.33,
            "load1": 4.64,
            "memory_used": 2810,
            "disk_used": 15497,
            "running": 0,
            "reachable": true,
            "sampled_at": "2026-11-05 18:01:00"
        }
    ],
    "totals": {
        "users_total": 2,
        "users_admin": 1,
        "users_2fa": 0,
        "servers_total": 1,
        "servers_suspended": 0,
        "servers_installing": 0,
        "nodes_total": 1,
        "allocations_total": 4,
        "allocations_used": 1,
        "memory_allocated": 1024,
        "disk_allocated": 2048,
        "cpu_allocated": 100
    },
    "health": {
        "collecting": true,
        "level": "full",
        "reasons": [],
        "last_pass_at": "2026-11-05 18:01:07",
        "warnings": [],
        "generated_at": "2026-11-05T18:02:07+02:00"
    }
};

export const server: ServerDetail = {
    "server": {
        "id": 1,
        "name": "Example",
        "identifier": "example",
        "uuid": "example-0000",
        "node": "Frankfurt-1",
        "node_id": 2,
        "account": "johhany310",
        "status": null,
        "memory_limit": 1024,
        "disk_limit": 2048,
        "cpu_limit": 100,
        "created_at": "2026-11-04T12:50:11+02:00"
    },
    "range": {
        "label": "24h",
        "from": "2026-11-04T18:02:08+02:00",
        "to": "2026-11-05T18:02:08+02:00",
        "tier": "raw",
        "bucket": 600,
        "seconds": 86400,
        "windows": [
            "15m",
            "1h",
            "6h",
            "24h",
            "7d",
            "30d",
            "90d"
        ]
    },
    "points": [
        {
            "t": 1793893800,
            "cpu": 0.01,
            "cpu_peak": 0.01,
            "memory": 87,
            "memory_peak": 87,
            "disk": 7,
            "samples": 2,
            "rx": 0,
            "tx": 0
        },
        {
            "t": 1793894400,
            "cpu": 0.01,
            "cpu_peak": 0.01,
            "memory": 87,
            "memory_peak": 87,
            "disk": 7,
            "samples": 1,
            "rx": 0,
            "tx": 0
        }
    ],
    "totals": {
        "points": 2,
        "samples": 3,
        "cpu": 0.01,
        "cpu_peak": 0.01,
        "memory": 87,
        "memory_peak": 87,
        "disk_peak": 7,
        "up": null,
        "restarts": 0,
        "rx": 0,
        "tx": 0
    },
    "incidents": [],
    "health": {
        "collecting": true,
        "level": "full",
        "reasons": [],
        "last_pass_at": "2026-11-05 18:01:07",
        "warnings": [],
        "generated_at": "2026-11-05T18:02:07+02:00"
    }
};

export const nodes: Nodes = {
    "range": {
        "label": "24h",
        "from": "2026-11-04T18:02:08+02:00",
        "to": "2026-11-05T18:02:08+02:00",
        "tier": "raw",
        "bucket": 600,
        "seconds": 86400,
        "windows": [
            "15m",
            "1h",
            "6h",
            "24h",
            "7d",
            "30d",
            "90d"
        ]
    },
    "nodes": [
        {
            "id": 2,
            "name": "Example-1",
            "fqdn": "node.example",
            "maintenance": false,
            "memory_total": 4096,
            "disk_total": 51200,
            "servers": 1,
            "cpu_allocated": 100,
            "memory_allocated": 1024,
            "disk_allocated": 2048,
            "cpu": 71.33,
            "load1": 4.64,
            "memory_used": 2810,
            "disk_used": 15497,
            "running": 0,
            "reachable": true,
            "sampled_at": "2026-11-05 18:01:00"
        }
    ],
    "live": {
        "running": 0,
        "total": 1
    },
    "panel_host": {
        "load": [
            3.30029296875,
            3.685546875,
            2.50439453125
        ],
        "cpus": 4,
        "memory": {
            "used": 2761924608,
            "total": 8326938624,
            "container": false
        },
        "disk": {
            "total": 102888095744,
            "free": 86637174784
        },
        "uptime": 681769
    },
    "fleet": [
        {
            "t": 1793893800,
            "servers": 1,
            "samples": 2,
            "cpu": 0.01,
            "cpu_peak": 0.01,
            "memory": 87,
            "memory_peak": 87,
            "rx": 0,
            "tx": 0
        },
        {
            "t": 1793894400,
            "servers": 1,
            "samples": 1,
            "cpu": 0.01,
            "cpu_peak": 0.01,
            "memory": 87,
            "memory_peak": 87,
            "rx": 0,
            "tx": 0
        }
    ],
    "health": {
        "collecting": true,
        "level": "full",
        "reasons": [],
        "last_pass_at": "2026-11-05 18:01:07",
        "warnings": [],
        "generated_at": "2026-11-05T18:02:07+02:00"
    }
};

export const node: NodeDetail = {
    "node": {
        "id": 2,
        "name": "Example-1",
        "fqdn": "node.example",
        "maintenance": false,
        "memory_total": 4096,
        "disk_total": 51200,
        "server_count": 1,
        "cpu_allocated": 100,
        "memory_allocated": 1024,
        "disk_allocated": 2048
    },
    "range": {
        "label": "30d",
        "from": "2026-10-06T19:02:08+03:00",
        "to": "2026-11-05T18:02:08+02:00",
        "tier": "hour",
        "bucket": 14400,
        "seconds": 2592000,
        "windows": [
            "15m",
            "1h",
            "6h",
            "24h",
            "7d",
            "30d",
            "90d"
        ]
    },
    "points": [
        {
            "t": 1793893200,
            "samples": 1,
            "servers": 1,
            "running": 0,
            "cpu": 47.08,
            "load1": 1.68,
            "memory_used": 2504,
            "memory_total": 7941,
            "disk_used": 15494,
            "disk_total": 98121,
            "memory_allocated": 1024,
            "disk_allocated": 2048,
            "cpu_allocated": 100,
            "reachable": null
        },
        {
            "t": 1793893800,
            "samples": 7,
            "servers": 1,
            "running": 0,
            "cpu": 57.9,
            "load1": 3.56,
            "memory_used": 2977,
            "memory_total": 7941,
            "disk_used": 15496,
            "disk_total": 98121,
            "memory_allocated": 1024,
            "disk_allocated": 2048,
            "cpu_allocated": 100,
            "reachable": 1
        },
        {
            "t": 1793894400,
            "samples": 1,
            "servers": 1,
            "running": 0,
            "cpu": 71.33,
            "load1": 4.64,
            "memory_used": 2810,
            "memory_total": 7941,
            "disk_used": 15497,
            "disk_total": 98121,
            "memory_allocated": 1024,
            "disk_allocated": 2048,
            "cpu_allocated": 100,
            "reachable": 1
        }
    ],
    "servers": [
        {
            "server_id": 1,
            "name": "Example",
            "short_id": "f32175ff",
            "node_id": 2,
            "memory_limit": 1024,
            "disk_limit": 2048,
            "cpu_limit": 100,
            "samples": 54,
            "cpu": 0,
            "cpu_peak": 0,
            "memory": 0,
            "memory_peak": 0,
            "disk": 0,
            "rx_bytes": 0,
            "tx_bytes": 0,
            "up": 0,
            "restarts": 0
        }
    ],
    "incidents": [],
    "health": {
        "collecting": true,
        "level": "full",
        "reasons": [],
        "last_pass_at": "2026-11-05 18:01:07",
        "warnings": [],
        "generated_at": "2026-11-05T18:02:07+02:00"
    }
};

export const resources: Resources = {
    "range": {
        "label": "30d",
        "from": "2026-10-06T19:02:08+03:00",
        "to": "2026-11-05T18:02:08+02:00",
        "tier": "hour",
        "bucket": 14400,
        "seconds": 2592000,
        "windows": [
            "15m",
            "1h",
            "6h",
            "24h",
            "7d",
            "30d",
            "90d"
        ]
    },
    "servers": [
        {
            "server_id": 1,
            "name": "Example",
            "cpu": 0,
            "cpu_limit": 100,
            "memory": 0,
            "memory_limit": 1024,
            "disk": 0,
            "disk_limit": 2048
        }
    ],
    "distribution": {
        "cpu": [
            {
                "band": "no limit recorded",
                "servers": 0
            },
            {
                "band": "0–25%",
                "servers": 1
            },
            {
                "band": "25–50%",
                "servers": 0
            },
            {
                "band": "50–75%",
                "servers": 0
            },
            {
                "band": "75–90%",
                "servers": 0
            },
            {
                "band": "90–100%",
                "servers": 0
            },
            {
                "band": "over 100%",
                "servers": 0
            }
        ],
        "memory": [
            {
                "band": "no limit recorded",
                "servers": 0
            },
            {
                "band": "0–25%",
                "servers": 1
            },
            {
                "band": "25–50%",
                "servers": 0
            },
            {
                "band": "50–75%",
                "servers": 0
            },
            {
                "band": "75–90%",
                "servers": 0
            },
            {
                "band": "90–100%",
                "servers": 0
            },
            {
                "band": "over 100%",
                "servers": 0
            }
        ],
        "disk": [
            {
                "band": "no limit recorded",
                "servers": 0
            },
            {
                "band": "0–25%",
                "servers": 1
            },
            {
                "band": "25–50%",
                "servers": 0
            },
            {
                "band": "50–75%",
                "servers": 0
            },
            {
                "band": "75–90%",
                "servers": 0
            },
            {
                "band": "90–100%",
                "servers": 0
            },
            {
                "band": "over 100%",
                "servers": 0
            }
        ]
    },
    "totals": {
        "users_total": 2,
        "users_admin": 1,
        "users_2fa": 0,
        "servers_total": 1,
        "servers_suspended": 0,
        "servers_installing": 0,
        "nodes_total": 1,
        "allocations_total": 4,
        "allocations_used": 1,
        "memory_allocated": 1024,
        "disk_allocated": 2048,
        "cpu_allocated": 100
    },
    "nodes": [
        {
            "id": 2,
            "name": "Example-1",
            "fqdn": "node.example",
            "maintenance": false,
            "memory_total": 4096,
            "disk_total": 51200,
            "servers": 1,
            "cpu_allocated": 100,
            "memory_allocated": 1024,
            "disk_allocated": 2048,
            "cpu": 71.33,
            "load1": 4.64,
            "memory_used": 2810,
            "disk_used": 15497,
            "running": 0,
            "reachable": true,
            "sampled_at": "2026-11-05 18:01:00"
        }
    ],
    "host": {
        "load": [
            3.30029296875,
            3.685546875,
            2.50439453125
        ],
        "cpus": 4,
        "memory": {
            "used": 2762993664,
            "total": 8326938624,
            "container": false
        },
        "disk": {
            "total": 102888095744,
            "free": 86637174784
        },
        "uptime": 681769
    },
    "health": {
        "collecting": true,
        "level": "full",
        "reasons": [],
        "last_pass_at": "2026-11-05 18:01:07",
        "warnings": [],
        "generated_at": "2026-11-05T18:02:07+02:00"
    }
};

export const customers: Customers = {
    "range": {
        "label": "30d",
        "from": "2026-10-06T19:02:08+03:00",
        "to": "2026-11-05T18:02:08+02:00",
        "tier": "hour",
        "bucket": 14400,
        "seconds": 2592000,
        "windows": [
            "15m",
            "1h",
            "6h",
            "24h",
            "7d",
            "30d",
            "90d"
        ]
    },
    "now": {
        "users_total": 2,
        "users_admin": 1,
        "users_2fa": 0,
        "servers_total": 1,
        "servers_suspended": 0,
        "servers_installing": 0,
        "nodes_total": 1,
        "allocations_total": 4,
        "allocations_used": 1,
        "memory_allocated": 1024,
        "disk_allocated": 2048,
        "cpu_allocated": 100
    },
    "series": [
        {
            "bucket": "2026-11-05",
            "users_total": 2,
            "users_admin": 1,
            "users_2fa": 0,
            "servers_total": 1,
            "servers_suspended": 0,
            "servers_installing": 0,
            "servers_active": 0,
            "nodes_total": 1,
            "allocations_total": 4,
            "allocations_used": 1,
            "memory_allocated": 1024,
            "disk_allocated": 2048,
            "cpu_allocated": 100,
            "servers_created": 0,
            "servers_deleted": 0,
            "users_created": 2
        }
    ],
    "accounts": [
        {
            "user_id": 1,
            "username": "example-user",
            "servers": 1,
            "memory": 1024,
            "disk": 2048,
            "cpu": 100
        },
        {
            "user_id": 802,
            "username": "example-user",
            "servers": 0,
            "memory": 0,
            "disk": 0,
            "cpu": 0
        }
    ],
    "health": {
        "collecting": true,
        "level": "full",
        "reasons": [],
        "last_pass_at": "2026-11-05 18:01:07",
        "warnings": [],
        "generated_at": "2026-11-05T18:02:07+02:00"
    }
};

export const network: Network = {
    "range": {
        "label": "30d",
        "from": "2026-10-06T19:02:08+03:00",
        "to": "2026-11-05T18:02:08+02:00",
        "tier": "hour",
        "bucket": 14400,
        "seconds": 2592000,
        "windows": [
            "15m",
            "1h",
            "6h",
            "24h",
            "7d",
            "30d",
            "90d"
        ]
    },
    "points": [
        {
            "t": 1793779200,
            "servers": 1,
            "samples": 13,
            "cpu": 0,
            "cpu_peak": 0,
            "memory": 0,
            "memory_peak": 0,
            "rx": 0,
            "tx": 0,
            "up": 0,
            "restarts": 0
        },
        {
            "t": 1793793600,
            "servers": 1,
            "samples": 41,
            "cpu": 0,
            "cpu_peak": 0,
            "memory": 0,
            "memory_peak": 0,
            "rx": 0,
            "tx": 0,
            "up": 0,
            "restarts": 0
        }
    ],
    "totals": {
        "points": 2,
        "samples": 54,
        "cpu": 0,
        "cpu_peak": 0,
        "memory": 0,
        "memory_peak": 0,
        "disk_peak": null,
        "up": 0,
        "restarts": 0,
        "rx": 0,
        "tx": 0
    },
    "talkers": {
        "rx": [
            {
                "server_id": 1,
                "name": "Example",
                "short_id": "f32175ff",
                "node_id": 2,
                "memory_limit": 1024,
                "disk_limit": 2048,
                "cpu_limit": 100,
                "samples": 54,
                "cpu": 0,
                "cpu_peak": 0,
                "memory": 0,
                "memory_peak": 0,
                "disk": 0,
                "rx_bytes": 0,
                "tx_bytes": 0,
                "up": 0,
                "restarts": 0
            }
        ],
        "tx": [
            {
                "server_id": 1,
                "name": "Example",
                "short_id": "f32175ff",
                "node_id": 2,
                "memory_limit": 1024,
                "disk_limit": 2048,
                "cpu_limit": 100,
                "samples": 54,
                "cpu": 0,
                "cpu_peak": 0,
                "memory": 0,
                "memory_peak": 0,
                "disk": 0,
                "rx_bytes": 0,
                "tx_bytes": 0,
                "up": 0,
                "restarts": 0
            }
        ]
    },
    "addresses": [
        {
            "node_id": 2,
            "name": "Example-1",
            "total": 4,
            "used": 1
        }
    ],
    "health": {
        "collecting": true,
        "level": "full",
        "reasons": [],
        "last_pass_at": "2026-11-05 18:01:07",
        "warnings": [],
        "generated_at": "2026-11-05T18:02:07+02:00"
    }
};

export const security: Security = {
    "range": {
        "label": "7d",
        "from": "2026-10-29T19:02:08+03:00",
        "to": "2026-11-05T18:02:08+02:00",
        "tier": "hour",
        "bucket": 3600,
        "seconds": 604800,
        "windows": [
            "15m",
            "1h",
            "6h",
            "24h",
            "7d",
            "30d",
            "90d"
        ]
    },
    "events": {
        "totals": [
            {
                "event": "auth:success",
                "occurrences": 68
            },
            {
                "event": "server:file.read",
                "occurrences": 22
            },
            {
                "event": "server:startup.edit",
                "occurrences": 8
            }
        ],
        "series": [
            {
                "t": 1793664000,
                "event": "auth:fail",
                "occurrences": 1
            },
            {
                "t": 1793664000,
                "event": "auth:success",
                "occurrences": 1
            },
            {
                "t": 1793664000,
                "event": "user:user.create",
                "occurrences": 1
            }
        ]
    },
    "timeline": [
        {
            "id": 140,
            "event": "admin:announcement.publish",
            "description": null,
            "ip": "203.0.113.10",
            "actor_type": "user",
            "actor_id": 1,
            "timestamp": "2026-11-05 17:54:24"
        },
        {
            "id": 139,
            "event": "admin:announcement.create",
            "description": null,
            "ip": "203.0.113.10",
            "actor_type": "user",
            "actor_id": 1,
            "timestamp": "2026-11-05 17:54:20"
        },
        {
            "id": 138,
            "event": "auth:success",
            "description": null,
            "ip": "203.0.113.10",
            "actor_type": "user",
            "actor_id": 1,
            "timestamp": "2026-11-05 16:22:36"
        }
    ],
    "probes": [
        {
            "address": "203.0.113.9",
            "requests": 170,
            "rejected": 80,
            "sample_path": "/example/path"
        },
        {
            "address": "203.0.113.9",
            "requests": 158,
            "rejected": 105,
            "sample_path": "/example/path"
        }
    ],
    "panel_errors": {
        "requests": 16365,
        "errors_4xx": 201,
        "errors_5xx": 44
    },
    "health": {
        "collecting": true,
        "level": "full",
        "reasons": [],
        "last_pass_at": "2026-11-05 18:01:07",
        "warnings": [],
        "generated_at": "2026-11-05T18:02:07+02:00"
    }
};

export const incidents: Incidents = {
    "range": {
        "label": "7d",
        "from": "2026-10-29T19:02:08+03:00",
        "to": "2026-11-05T18:02:08+02:00",
        "tier": "hour",
        "bucket": 3600,
        "seconds": 604800,
        "windows": [
            "15m",
            "1h",
            "6h",
            "24h",
            "7d",
            "30d",
            "90d"
        ]
    },
    "counts": {
        "open": 0,
        "resolved": 0,
        "servers": 0,
        "nodes": 0
    },
    "incidents": [],
    "rules": [],
    "configured_at": "/admin/monitoring",
    "context": {
        "fleet": {
            "points": 6,
            "samples": 54,
            "cpu": 0,
            "cpu_peak": 0,
            "memory": 0,
            "memory_peak": 0,
            "disk_peak": null,
            "up": 0,
            "restarts": 0,
            "rx": 0,
            "tx": 0
        },
        "requests": 16365,
        "errors_5xx": 44
    },
    "health": {
        "collecting": true,
        "level": "full",
        "reasons": [],
        "last_pass_at": "2026-11-05 18:01:07",
        "warnings": [],
        "generated_at": "2026-11-05T18:02:07+02:00"
    }
};

export const status: StatusReport = {
    "generated_at": "2026-11-05T18:02:07+02:00",
    "configuration": {
        "enabled": true,
        "nodes": true,
        "http": true,
        "security": true,
        "retention": {
            "minute_days": 2,
            "hourly_days": 90,
            "daily_days": 730,
            "http_days": 30,
            "security_days": 365
        },
        "limits": {
            "load_ceiling": 1.5,
            "memory_floor_mib": 512,
            "disk_floor_mib": 1024,
            "rows_per_pass": 20000,
            "seconds_per_pass": 120
        }
    },
    "pressure": {
        "level": "full",
        "reasons": [],
        "cores": 4,
        "load_per_core": 1.161,
        "memory_available_mib": 5125,
        "disk_free_mib": 82624,
        "measured_at": "2026-11-05T18:01:07+02:00"
    },
    "cursors": {
        "last_pass_at": "2026-11-05 18:01:07",
        "activity_id": 138,
        "access_log_inode": 541584,
        "access_log_offset": 4850431,
        "server_hour": "2026-11-05 17:00:00",
        "server_day": "2026-11-05 00:00:00",
        "node_hour": "2026-11-05 17:00:00",
        "node_day": "2026-11-05 00:00:00",
        "http_hour": "2026-11-05 17:00:00",
        "http_day": "2026-11-05 00:00:00"
    },
    "stored": [
        {
            "table": "ext_analytics_server_series",
            "tier": "day",
            "rows": 1,
            "oldest": "2026-11-04 00:00:00",
            "newest": "2026-11-04 00:00:00"
        },
        {
            "table": "ext_analytics_server_series",
            "tier": "hour",
            "rows": 6,
            "oldest": "2026-11-04 12:00:00",
            "newest": "2026-11-04 17:00:00"
        },
        {
            "table": "ext_analytics_node_series",
            "tier": "minute",
            "rows": 9,
            "oldest": "2026-11-05 17:49:00",
            "newest": "2026-11-05 18:01:00"
        },
        {
            "table": "ext_analytics_http_series",
            "tier": "day",
            "rows": 7,
            "oldest": "2026-10-29 00:00:00",
            "newest": "2026-11-04 00:00:00"
        },
        {
            "table": "ext_analytics_http_series",
            "tier": "hour",
            "rows": 48,
            "oldest": "2026-11-03 17:00:00",
            "newest": "2026-11-05 16:00:00"
        },
        {
            "table": "ext_analytics_http_series",
            "tier": "minute",
            "rows": 713,
            "oldest": "2026-11-03 00:35:00",
            "newest": "2026-11-05 15:58:00"
        },
        {
            "table": "ext_analytics_http_routes",
            "tier": null,
            "rows": 616,
            "oldest": "2026-11-03 00:00:00",
            "newest": "2026-11-05 15:00:00"
        },
        {
            "table": "ext_analytics_http_probes",
            "tier": null,
            "rows": 138,
            "oldest": "2026-11-03 00:00:00",
            "newest": "2026-11-05 15:00:00"
        },
        {
            "table": "ext_analytics_security_events",
            "tier": null,
            "rows": 44,
            "oldest": "2026-11-03 02:00:00",
            "newest": "2026-11-05 16:00:00"
        },
        {
            "table": "ext_analytics_snapshots_daily",
            "tier": null,
            "rows": 1,
            "oldest": "2026-11-05",
            "newest": "2026-11-05"
        }
    ],
    "sources": {
        "samples": {
            "present": true,
            "rows": 57,
            "raw_horizon_seconds": 104828
        },
        "access_log": {
            "path": "/var/log/nginx/pterodactyl.app-access.access",
            "readable": true,
            "bytes": 4850848
        },
        "activity_log": 128,
        "notes": [
            "Node CPU, memory and disk usage are only measured on the machine the panel runs on: Wings reports no usage figures, so every other node is shown as capacity and allocation rather than as load.",
            "Request latency is not collected. The nginx log on this install carries no timing field, so no response-time figure is stored or drawn.",
            "Nothing is sampled during a user request; every figure on screen was written by a scheduled pass."
        ]
    },
    "jobs": {
        "nodes": {
            "at": "2026-11-05T18:01:07+02:00",
            "seconds": 0.451,
            "level": "full",
            "stopped": null,
            "written": 1
        },
        "security": {
            "at": "2026-11-05T17:52:29+02:00",
            "seconds": 0.031,
            "level": "full",
            "stopped": null,
            "rows": 0,
            "events": 0
        },
        "snapshot": {
            "at": "2026-11-05T17:52:28+02:00",
            "seconds": 0.098,
            "level": "full",
            "stopped": null,
            "written": 1
        },
        "rollup": {
            "at": "2026-11-05T17:58:07+02:00",
            "seconds": 0.76,
            "level": "full",
            "stopped": null,
            "written": 0,
            "buckets": 0
        },
        "http": {
            "at": "2026-11-05T17:58:07+02:00",
            "seconds": 1.217,
            "level": "full",
            "stopped": null,
            "entries": 192,
            "written": 0,
            "buckets": 5
        }
    },
    "missing": [],
    "collecting": true
};
