# Server Summary

Last updated: 2026-04-02

---

## oracle-1 — `129.146.183.89` (ARM)

### Resources
| Resource | Value |
|----------|-------|
| **CPU** | 2 vCPU — ARM Neoverse-N1 (1 thread/core) |
| **RAM** | 7.7 GB total, ~6.3 GB available |
| **Swap** | none |
| **Disk** | 45 GB, 35 GB free (23% used) |
| **OS** | Ubuntu 22.04.5 LTS |
| **Uptime** | 650 days |
| **Network** | ~38 MB/s download (~300 Mbps) |

### Application Services
| Service | Description |
|---------|-------------|
| `gin_login_bot` | Go API/bot — listening on :443 |
| `xray` | Proxy — localhost:10000 |
| `python3 main.py` | Python process (704 MB RSS — biggest memory consumer) |
| `docker` | Installed, **no containers running** |
| `nginx` | Enabled but **not running** |
| `wg0` (WireGuard) | Interface exists, UDP :51820 open |

### Ports
| Port | Protocol | Process | Exposed? |
|------|----------|---------|----------|
| 22 | TCP | sshd | yes |
| 80 | TCP | — (nothing bound) | firewall open |
| 443 | TCP | gin_login_bot | yes |
| 8080 | TCP | — (nothing bound) | firewall open |
| 10000 | TCP | xray | localhost only |
| 51820 | UDP | WireGuard | yes |
| 111 | TCP/UDP | rpcbind | yes (should probably close) |

### Docker
Empty — no containers, no images, no volumes.

---

## oracle-2 — `129.146.130.46` (x86)

### Resources
| Resource | Value |
|----------|-------|
| **CPU** | 2 vCPU — AMD EPYC 7551 (SMT, 2 threads on 1 core) |
| **RAM** | 958 MB total, ~489 MB available |
| **Swap** | 1 GB (854 MB free) |
| **Disk** | 45 GB, 33 GB free (27% used) |
| **OS** | Ubuntu 22.04.2 LTS |
| **Uptime** | 409 days |
| **Network** | ~6.8 MB/s download (~54 Mbps) |

### Application Services
| Service | Description |
|---------|-------------|
| `bt` (BT-Panel/aaPanel) | Web hosting panel — :7800 |
| `php-fpm-74` | PHP 7.4 FPM |
| `pure-ftpd` | FTP server — :21 |
| `sendmail` | Mail — localhost :25/:587 |
| `tailscaled` | Tailscale VPN — UDP :41641 |
| `docker` | Installed, **no containers running** |

### Ports
| Port | Protocol | Process | Exposed? |
|------|----------|---------|----------|
| 21 | TCP | pure-ftpd | yes |
| 22 | TCP | sshd | yes |
| 80 | TCP | — (nothing bound) | firewall open |
| 888 | TCP | — (nothing bound) | firewall open |
| 7800 | TCP | BT-Panel | yes |
| 25 | TCP | sendmail | localhost only |
| 587 | TCP | sendmail | localhost only |
| 111 | TCP/UDP | rpcbind | yes |
| 39000-40000 | TCP | — (FTP passive range) | firewall open |
| 41641 | UDP | tailscaled | yes |

### Docker
Empty — no containers, no images, no volumes.

---

## Comparison

|                  | **oracle-1** | **oracle-2** |
|------------------|--------------|--------------|
| **SSH alias** | `ssh oracle-1` | `ssh oracle-2` |
| **Public IP** | 129.146.183.89 | 129.146.130.46 |
| **Arch** | aarch64 (ARM) | x86_64 (AMD) |
| **CPU** | 2 vCPU Neoverse-N1 | 2 vCPU EPYC 7551 (SMT) |
| **RAM** | 7.7 GB | 958 MB |
| **Disk** | 45 GB (35 GB free) | 45 GB (33 GB free) |
| **Network** | ~300 Mbps | ~54 Mbps |
| **Key workloads** | Go bot, xray, Python | BT-Panel, PHP, FTP, Tailscale |
| **Docker** | empty | empty |
