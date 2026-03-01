import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import styles from "../page.module.css";

export default function PrivacyPage() {
    return (
        <main className={styles.main}>
            <div style={{ position: "relative", zIndex: 10, maxWidth: "800px", margin: "0 auto", padding: "4rem 5%" }}>
                <Link
                    href="/Frontend"
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        color: "#a594fd",
                        textDecoration: "none",
                        marginBottom: "2rem",
                        fontWeight: "500",
                    }}
                >
                    <ArrowLeft size={16} /> Back to Home
                </Link>

                <div style={{
                    background: "rgba(25, 25, 30, 0.6)",
                    backdropFilter: "blur(20px)",
                    border: "1px solid rgba(255, 255, 255, 0.05)",
                    borderRadius: "24px",
                    padding: "3rem",
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "2rem" }}>
                        <div className={styles.securityBadge} style={{ width: "48px", height: "48px", marginBottom: "0" }}>
                            <ShieldCheck size={24} />
                        </div>
                        <h1 className={styles.title} style={{ fontSize: "2.5rem", margin: 0 }}>Privacy Policy</h1>
                    </div>

                    <div style={{ color: "#8a8f98", lineHeight: "1.7", fontSize: "1.05rem" }}>
                        <p style={{ marginBottom: "2rem", paddingBottom: "1.5rem", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                            <strong style={{ color: "#fff" }}>Effective Date:</strong> {new Date().toLocaleDateString()}
                        </p>
                        <h2 style={{ marginTop: "2rem", marginBottom: "1rem", color: "#fff", fontSize: "1.5rem", fontWeight: "600" }}>
                            1. Data Collection
                        </h2>
                        <p style={{ marginBottom: "1.5rem" }}>
                            We access your email account strictly through secure OAuth mechanisms.
                            We <strong style={{ color: "#fff" }}>only</strong> collect and analyze email headers (Senders
                            and Subject lines). We <strong style={{ color: "#fff" }}>never</strong> download, read, or store the
                            actual content (body) of your personal emails.
                        </p>
                        <h2 style={{ marginTop: "2rem", marginBottom: "1rem", color: "#fff", fontSize: "1.5rem", fontWeight: "600" }}>
                            2. Data Usage
                        </h2>
                        <p style={{ marginBottom: "1.5rem" }}>
                            The metadata we analyze is used solely to identify online services you
                            have interacted with in the past. This data is processed locally and securely.
                        </p>
                        <h2 style={{ marginTop: "2rem", marginBottom: "1rem", color: "#fff", fontSize: "1.5rem", fontWeight: "600" }}>
                            3. Data Sharing
                        </h2>
                        <p style={{ marginBottom: "1.5rem" }}>
                            We do not sell, rent, or trade your personal information. Your data is
                            never shared with third parties for marketing purposes.
                        </p>
                        <h2 style={{ marginTop: "2rem", marginBottom: "1rem", color: "#fff", fontSize: "1.5rem", fontWeight: "600" }}>
                            4. Data Revocation
                        </h2>
                        <p style={{ marginBottom: "1.5rem" }}>
                            You can revoke our access to your Google account at any time through
                            your Google Account settings. Upon revocation or account deletion, all
                            associated data mapped by our service is permanently deleted from our
                            servers.
                        </p>
                    </div>
                </div>
            </div>
        </main>
    );
}
