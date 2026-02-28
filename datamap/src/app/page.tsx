"use client";

import {
	AlertTriangle,
	ArrowRight,
	Database,
	EyeOff,
	Lock,
	Mail,
	Search,
	ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import DarkVeil from "~/components/DarkVeil";
import styles from "./page.module.css";

export default function Home() {
	const scrollToLogin = () => {
		document
			.getElementById("login-section")
			?.scrollIntoView({ behavior: "smooth" });
	};

	return (
		<main className={styles.main}>
			<div className={styles.bgGlow} />

			{/* Navigation */}
			<nav className={styles.nav}>
				<div className={styles.logo}>
					<Database className={styles.logoIcon} size={24} />
					DataMap
				</div>
				<button
					type="button"
					className={styles.ctaButton}
					onClick={scrollToLogin}
					style={{ padding: "0.6rem 1.25rem", fontSize: "0.9rem" }}
				>
					Sign In
				</button>
			</nav>

			{/* Hero Section */}
			<section className={styles.hero}>
				<div className={styles.lightPillarWrapper}>
					<DarkVeil
						hueShift={0}
						noiseIntensity={0}
						scanlineIntensity={0}
						speed={0.5}
						scanlineFrequency={0}
						warpAmount={0}
					/>
				</div>

				<div className={styles.heroContent}>
					<div className={styles.pill}>
						<ShieldCheck size={16} /> Testing mode
					</div>
					<h1 className={styles.title}>
						Find and delete forgotten accounts hiding in your inbox
					</h1>
					<p className={styles.subtitle}>
						DataMap securely scans your email headers to identify every service
						you've ever signed up for, scoring them for risk so you can reclaim
						your digital footprint.
					</p>
					<div className={styles.ctaContainer}>
						<button
							type="button"
							className={styles.ctaButton}
							onClick={scrollToLogin}
						>
							Scan My Inbox <ArrowRight size={20} />
						</button>
					</div>
				</div>
			</section>

			{/* Methodology Section */}
			<section className={styles.methodology}>
				<div className={styles.sectionHeader}>
					<h2 className={styles.sectionTitle}>How It Works</h2>
					<p className={styles.sectionSubtitle}>
						A transparent 3-step process to map your digital presence without
						compromising your privacy.
					</p>
				</div>

				<div className={styles.steps}>
					<div className={styles.stepCard}>
						<div className={styles.stepNumber}>1</div>
						<div className={styles.stepIcon}>
							<Search size={28} />
						</div>
						<h3 className={styles.stepTitle}>Discovery Discovery</h3>
						<p className={styles.stepText}>
							We securely scan only your email metadata (Senders & Subjects) to
							find welcome emails, password resets, and marketing messages from
							forgotten accounts.
						</p>
					</div>

					<div className={styles.stepCard}>
						<div className={styles.stepNumber}>2</div>
						<div className={styles.stepIcon}>
							<AlertTriangle size={28} />
						</div>
						<h3 className={styles.stepTitle}>Risk Scoring</h3>
						<p className={styles.stepText}>
							Every identified service is analyzed against our threat
							intelligence database to determine its security posture and value
							to hackers.
						</p>
					</div>

					<div className={styles.stepCard}>
						<div className={styles.stepNumber}>3</div>
						<div className={styles.stepIcon}>
							<ShieldCheck size={28} />
						</div>
						<h3 className={styles.stepTitle}>Breach Cross-Check</h3>
						<p className={styles.stepText}>
							We automatically cross-reference your discovered accounts against
							known data breaches, alerting you to immediate credential risks.
						</p>
					</div>
				</div>
			</section>

			{/* Security Hub */}
			<section className={styles.security}>
				<div className={styles.securityBadge}>
					<Lock size={40} />
				</div>
				<h2 className={styles.sectionTitle}>Absolute Privacy</h2>
				<p className={styles.sectionSubtitle}>
					Because we ask for email access, we believe in radical transparency.
					Your data is exactly that—yours.
				</p>

				<div className={styles.securityGrid}>
					<div className={styles.securityItem}>
						<EyeOff className={styles.checkIcon} size={24} />
						<div>
							<h4 className={styles.securityItemTitle}>
								We never read your emails
							</h4>
							<p className={styles.securityItemText}>
								Our scanners only look at header metadata (From, Date, Subject).
								The actual content of your personal conversations is completely
								ignored and never downloaded.
							</p>
						</div>
					</div>

					<div className={styles.securityItem}>
						<ShieldCheck className={styles.checkIcon} size={24} />
						<div>
							<h4 className={styles.securityItemTitle}>
								No data selling. Ever.
							</h4>
							<p className={styles.securityItemText}>
								We do not sell, rent, or monetize your personal information or
								the list of services you use. Our business model relies entirely
								on user subscriptions.
							</p>
						</div>
					</div>

					<div className={styles.securityItem}>
						<Mail className={styles.checkIcon} size={24} />
						<div>
							<h4 className={styles.securityItemTitle}>Revoke anytime</h4>
							<p className={styles.securityItemText}>
								You can revoke our access to your Google account with one click,
								and instantly delete all mapped data from our servers.
							</p>
						</div>
					</div>
				</div>
			</section>

			{/* Login Portal */}
			<section className={styles.login} id="login-section">
				<div className={styles.loginCard}>
					<h2
						className={styles.sectionTitle}
						style={{ marginBottom: "0.5rem" }}
					>
						Ready to map your data?
					</h2>
					<p
						className={styles.sectionSubtitle}
						style={{ marginBottom: "2rem" }}
					>
						Securely connect with Google to begin the initial scan.
					</p>

					<button type="button" className={styles.googleBtn}>
						<svg
							role="img"
							aria-label="Google Logo"
							height="24"
							viewBox="0 0 24 24"
							width="24"
							xmlns="http://www.w3.org/2000/svg"
						>
							<title>Google Logo</title>
							<path
								d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
								fill="#4285F4"
							/>
							<path
								d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
								fill="#34A853"
							/>
							<path
								d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
								fill="#FBBC05"
							/>
							<path
								d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
								fill="#EA4335"
							/>
						</svg>
						Continue with Google
					</button>

					<p
						style={{
							fontSize: "0.8rem",
							color: "#8A8F98",
							marginTop: "1.5rem",
							lineHeight: "1.5",
						}}
					>
						By continuing, you agree to our <Link href="/terms" style={{ color: "#a594fd" }}>Terms of Service</Link> and{" "}
						<Link href="/privacy" style={{ color: "#a594fd" }}>Privacy Policy</Link>.
					</p>
				</div>
			</section>

			{/* Footer */}
			<footer className={styles.footer}>
				<div>© 2026 DataMap. All rights reserved.</div>
				<div className={styles.footerLinks}>
					<Link href="/terms">Terms</Link>
					<Link href="/privacy">Privacy</Link>
					<Link href="/contact">Contact</Link>
				</div>
			</footer>
		</main>
	);
}
