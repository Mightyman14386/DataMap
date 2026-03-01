"use client";

import { AlertTriangle, ArrowRight, EyeOff, Lock, ShieldCheck } from "lucide-react";
import Link from "next/link";
import DarkVeil from "~/components/DarkVeil";
import styles from "./page.module.css";
import { signIn } from "next-auth/react";

export default function AuthorizePage() {


    const handleAuthorize = () => {
        // In a real app, this would trigger the actual OAuth flow.
        // For now, we simulate the redirect to the scanning loading state.
        signIn("google", { callbackUrl: "/Frontend/scan" });
    };

    return (
        <main className={styles.main}>
            {/* Animated Glow Background */}
            <div className={styles.bgGlow}></div>

            <nav className={styles.nav}>
                <Link href="/Frontend" className={styles.logo}>
                    <img src="/logo.svg" alt="DataMap Logo" className={styles.logoIcon} width={24} height={24} style={{ borderRadius: '50%' }} />
                    DataMap
                </Link>
            </nav>

            <section className={styles.container}>
                <div className={styles.glassPanel}>
                    {/* HUD Corners */}
                    <div className={styles.hudCornerTopLeft}></div>
                    <div className={styles.hudCornerBottomRight}></div>

                    <div className={styles.header}>
                        <div className={styles.iconWrapper}>
                            <Lock size={32} className={styles.icon} />
                        </div>
                        <h1 className={styles.title}>Authorization Required</h1>
                        <p className={styles.subtitle}>
                            Grant read-only access to securely map your digital privacy footprint
                        </p>
                    </div>

                    <div className={styles.permissionsBox}>
                        <h3 className={styles.permissionsTitle}>REQUESTED PERMISSIONS</h3>
                        <ul className={styles.permissionsList}>
                            <li className={styles.permissionItem}>
                                <ShieldCheck size={20} className={styles.permissionIconSafe} />
                                <div>
                                    <h4 className={styles.permissionName}>Read Emails</h4>
                                    <p className={styles.permissionDesc}>Access Email data</p>
                                </div>
                            </li>
                            <li className={styles.permissionItem}>
                                <AlertTriangle size={20} className={styles.permissionIconWarn} />
                                <div>
                                    <h4 className={styles.permissionName}>Breach Cross-check</h4>
                                    <p className={styles.permissionDesc}>Found services will be verified against HaveIBeenPwned API</p>
                                </div>
                            </li>
                        </ul>
                    </div>

                    <div className={styles.actions}>
                        <button
                            type="button"
                            className={styles.authorizeButton}
                            onClick={handleAuthorize}
                        >
                            Authorize Scan <ArrowRight size={18} />
                        </button>
                    </div>

                    <p className={styles.footerText}>
                        Connection secured via OAuth 2.0. You can revoke access at any time from your Google Account settings.
                    </p>
                </div>
            </section>
        </main >
    );
}
