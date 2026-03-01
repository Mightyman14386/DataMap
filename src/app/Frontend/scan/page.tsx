"use client";

import { useEffect, useState } from "react";
import { Database, ShieldCheck, Search, Activity, Cpu } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DarkVeil from "~/components/DarkVeil";
import styles from "./page.module.css";

export default function ScanPage() {
    const router = useRouter();
    const [logs, setLogs] = useState<{ id: number; text: string; status: "pending" | "done" | "warn" | "error" | "info" }[]>([]);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        const sequence = [
            { time: 500, text: "INITIATING PROTOCOL: DISCOVERY_SCAN_V2", status: "info" },
            { time: 1500, text: "Authenticating with provider... SUCCESS", status: "done" },
            { time: 2500, text: "Scanning headers for 'Welcome', 'Verify', 'Confirmation'...", status: "pending" },
            { time: 4500, text: "Found 14 unique service registrations.", status: "info" },
            { time: 5500, text: "Cross-checking HaveIBeenPwned database...", status: "pending" },
            { time: 7000, text: "Breach Check: 3 domains flagged in known data breaches.", status: "warn" },
            { time: 8000, text: "Analyzing Privacy Policies with AI...", status: "pending" },
            { time: 10000, text: "Analysis Engine: 2 policies marked HIGH RISK (Data selling detected).", status: "warn" },
            { time: 11000, text: "Aggregating threat model data...", status: "pending" },
            { time: 12500, text: "SCAN COMPLETE. Generating DataMap...", status: "done" },
        ];

        let timeouts: NodeJS.Timeout[] = [];

        sequence.forEach((item, index) => {
            const timeout = setTimeout(() => {
                setLogs((prev) => [...prev, { id: index, text: item.text, status: item.status as any }]);
                setProgress(Math.floor(((index + 1) / sequence.length) * 100));
            }, item.time);
            timeouts.push(timeout);
        });

        const redirectTimeout = setTimeout(() => {
            // In fully built app, this directs to dashboard. For now, it could push to a non-existent route or just stay.
            router.push("/Frontend/dashboard");
        }, 14500);
        timeouts.push(redirectTimeout);

        return () => timeouts.forEach((t) => clearTimeout(t));
    }, [router]);

    return (
        <main className={styles.main}>
            {/* Animated Glow Background */}
            <div className={styles.bgGlow}></div>

            <nav className={styles.nav}>
                <div className={styles.logo}>
                    <Database className={styles.logoIcon} size={24} />
                    DataMap
                </div>
                <div className={styles.statusPill}>
                    <Activity size={14} className={styles.pulseIcon} /> SCAN IN PROGRESS
                </div>
            </nav>

            <section className={styles.container}>
                <div className={styles.glassPanel}>
                    {/* HUD Corners */}
                    <div className={styles.hudCornerTopLeft}></div>
                    <div className={styles.hudCornerBottomRight}></div>

                    {progress < 100 && <div className={styles.hudCornerTopRight}></div>}
                    {progress < 100 && <div className={styles.hudCornerBottomLeft}></div>}

                    <div className={styles.header}>
                        <div className={styles.iconWrapper}>
                            <Cpu size={36} className={styles.icon} />
                        </div>
                        <h1 className={styles.title}>Email Analysis</h1>
                        <p className={styles.subtitle}>
                            Please wait while we map and evaluate your digital footprint.
                        </p>
                    </div>

                    {/* Progress Bar */}
                    <div className={styles.progressBarWrapper}>
                        <div
                            className={styles.progressBarFill}
                            style={{ width: `${progress}%` }}
                        ></div>
                        <div className={styles.progressGlow} style={{ left: `${progress}%` }}></div>
                    </div>
                    <div className={styles.progressText}>
                        <span>RISK ANALYSIS ENGINE</span>
                        <span>{progress}%</span>
                    </div>

                    {/* Log Terminal */}
                    <div className={styles.terminal}>
                        <div className={styles.terminalHeader}>
                            <div className={styles.terminalDot} style={{ background: '#FF003C' }}></div>
                            <div className={styles.terminalDot} style={{ background: '#FFB000' }}></div>
                            <div className={styles.terminalDot} style={{ background: '#00FF41' }}></div>
                            <span className={styles.terminalTitle}>DATAMAP LOG</span>
                        </div>
                        <div className={styles.terminalBody}>
                            {logs.map((log) => (
                                <div key={log.id} className={styles.logLine}>
                                    <span className={styles.logTime}>[{new Date().toISOString().substring(11, 19)}]</span>
                                    <span className={`${styles.logStatus} ${styles[log.status]}`}>
                                        {log.status === 'pending' && '> '}
                                        {log.status === 'done' && '✓ '}
                                        {log.status === 'warn' && '⚠ '}
                                        {log.status === 'error' && '✖ '}
                                        {log.status === 'info' && 'ℹ '}
                                    </span>
                                    <span className={styles.logText}>{log.text}</span>
                                </div>
                            ))}
                            {progress < 100 && (
                                <div className={styles.logLine}>
                                    <span className={styles.logTime}>[{new Date().toISOString().substring(11, 19)}]</span>
                                    <span className={styles.cursorBlink}>_</span>
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </section>
        </main>
    );
}
