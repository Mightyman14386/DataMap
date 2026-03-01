"use client";

import { useEffect, useState, useRef } from "react";
import { Database, ShieldCheck, Search, Activity, Cpu } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DarkVeil from "~/components/DarkVeil";
import styles from "./page.module.css";

interface ScanLog {
	id: number;
	text: string;
	status: "pending" | "done" | "warn" | "error" | "info";
}

export default function ScanPage() {
	const router = useRouter();
	const [logs, setLogs] = useState<ScanLog[]>([]);
	const [progress, setProgress] = useState(0);
	const [isScanning, setIsScanning] = useState(true);
	const [scanError, setScanError] = useState<string | null>(null);
	const scanStartedRef = useRef(false); // Use ref to persist across renders

	useEffect(() => {
		// Prevent multiple concurrent scans - ref persists across StrictMode re-renders
		if (scanStartedRef.current) return;
		scanStartedRef.current = true;

		const addLog = (id: number, text: string, status: ScanLog["status"]) => {
			setLogs(prev => [...prev, { id, text, status }]);
		};

		const runScan = async () => {
			try {
				// Add initial log
				const initialLog: ScanLog = {
					id: 0,
					text: "INITIATING PROTOCOL: DISCOVERY_SCAN_V2",
					status: "info"
				};
				setLogs([initialLog]);
				setProgress(10);

				// Check authentication status first
				let logId = 1;
				addLog(logId++, "Verifying authentication status...", "pending");				setProgress(15);

				const sessionResponse = await fetch("/Backend/api/auth/session", {
					method: "GET",
					credentials: "include"
				});

				console.log("[Scan] Session endpoint response status:", sessionResponse.status);

				if (!sessionResponse.ok) {
					const errorText = await sessionResponse.text();
					console.error("[Scan] Session endpoint error:", errorText);
					throw new Error("Not authenticated. Please log in first.");
				}

				const session = await sessionResponse.json();
				console.log("[Scan] Session data:", session);
				
				if (!session?.user?.id) {
					console.error("[Scan] Session missing user.id. Session:", session);
					throw new Error("Unable to retrieve user session. Please log in again.");
				}

				addLog(logId++, "✓ Authentication verified", "done");
				setProgress(20);

				// Start the scan
				addLog(logId++, "Authenticating with Google and fetching emails...", "pending");
				setProgress(25);

				const scanResponse = await fetch("/Backend/api/gmail/scan", {
					method: "GET",
					credentials: "include"
				});

				if (!scanResponse.ok) {
					const errorData = await scanResponse.json();
					const errorMsg = errorData.error || `Scan failed with status ${scanResponse.status}`;
					
					// Better error messages for specific cases
					if (errorMsg.includes("No Google account linked")) {
						throw new Error("Google account not linked. Please complete the authorization flow. Redirecting to authorization page...");
					}
					throw new Error(errorMsg);
				}

				const scanData = await scanResponse.json();
				addLog(logId++, "✓ Email fetch complete", "done");
				setProgress(30);

				// Extract data
				const { count, summary, results } = scanData;
				addLog(logId++, `Found ${count} services from your emails`, "info");
				setProgress(40);

				// Show tier breakdown
				addLog(logId++, `Risk Tiers: ${summary.red} High Risk | ${summary.yellow} Medium Risk | ${summary.green} Safe`, "info");
				setProgress(60);

				// Breach report
				const breachCount = results.filter((r: any) => r.breachInfo?.wasBreached).length;
				if (breachCount > 0) {
					addLog(logId++, `⚠ ${breachCount} service(s) found in data breaches`, "warn");
				} else {
					addLog(logId++, `✓ No known data breaches detected`, "done");
				}
				setProgress(80);

				// Finalization
				addLog(logId++, "Generating DataMap visualization...", "pending");
				setProgress(90);

				// Summary
				addLog(logId++, `✓ SCAN COMPLETE: ${count} services analyzed and cached`, "done");
				setProgress(100);

				setIsScanning(false);

				// Redirect after a short delay
				setTimeout(() => {
					router.push("/Frontend/dashboard");
				}, 1500);
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
				console.error("Scan failed:", error);
				setScanError(errorMessage);
				addLog(999, `✖ SCAN FAILED: ${errorMessage}`, "error");
				setIsScanning(false);
				setProgress(100);

				// Redirect to authorize page after delay if Google account not linked
				if (errorMessage.includes("Google account not linked")) {
					setTimeout(() => {
						router.push("/Frontend/authorize");
					}, 3000);
				}
			}
		};

		runScan();
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
					<Activity size={14} className={styles.pulseIcon} /> {isScanning ? "SCAN IN PROGRESS" : "SCAN COMPLETE"}
				</div>
			</nav>

			<section className={styles.container}>
				<div className={styles.glassPanel}>
					{/* HUD Corners */}
					<div className={styles.hudCornerTopLeft}></div>
					<div className={styles.hudCornerBottomRight}></div>

					{isScanning && <div className={styles.hudCornerTopRight}></div>}
					{isScanning && <div className={styles.hudCornerBottomLeft}></div>}

					<div className={styles.header}>
						<div className={styles.iconWrapper}>
							<Cpu size={36} className={styles.icon} />
						</div>
						<h1 className={styles.title}>Email Analysis</h1>
						<p className={styles.subtitle}>
							{scanError 
								? "An error occurred during the scan." 
								: "Please wait while we map and evaluate your digital footprint."}
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
							{isScanning && (
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
