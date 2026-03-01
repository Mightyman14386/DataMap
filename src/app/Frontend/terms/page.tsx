import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import styles from "../page.module.css";

export default function TermsPage() {
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
                            <FileText size={24} />
                        </div>
                        <h1 className={styles.title} style={{ fontSize: "2.5rem", margin: 0 }}>Terms of Service</h1>
                    </div>

                    <div style={{ color: "#8a8f98", lineHeight: "1.7", fontSize: "1.05rem" }}>
                        <p style={{ marginBottom: "2rem", paddingBottom: "1.5rem", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                            <strong style={{ color: "#fff" }}>Effective Date:</strong> {new Date().toLocaleDateString()}
                        </p>
                        <h2 style={{ marginTop: "2rem", marginBottom: "1rem", color: "#fff", fontSize: "1.5rem", fontWeight: "600" }}>
                            1. Acceptance of Terms
                        </h2>
                        <p style={{ marginBottom: "1.5rem" }}>
                            By accessing or using DataMap ("Service"), you agree to be bound by
                            these Terms of Service. If you do not agree to these terms, please do
                            not use the Service.
                        </p>
                        <h2 style={{ marginTop: "2rem", marginBottom: "1rem", color: "#fff", fontSize: "1.5rem", fontWeight: "600" }}>
                            2. Description of Service
                        </h2>
                        <p style={{ marginBottom: "1.5rem" }}>
                            DataMap is a service that scans your email metadata (headers, senders,
                            and subjects) to identify accounts and services you have signed up for.
                        </p>
                        <h2 style={{ marginTop: "2rem", marginBottom: "1rem", color: "#fff", fontSize: "1.5rem", fontWeight: "600" }}>
                            3. Disclaimer of Warranties and Limitation of Liability
                        </h2>
                        <p style={{ marginBottom: "1.5rem" }}>
                            <strong style={{ color: "#fff" }}>
                                YOUR USE OF THE SERVICE IS AT YOUR SOLE RISK. THE SERVICE IS
                                PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS. DATAMAP EXPRESSLY
                                DISCLAIMS ALL WARRANTIES OF ANY KIND.
                            </strong>
                        </p>
                        <p style={{ marginBottom: "1.5rem" }}>
                            <strong style={{ color: "#fff" }}>
                                DATAMAP ASSUMES NO LIABILITY WHATSOEVER FOR ANY DIRECT, INDIRECT,
                                INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR EXEMPLARY DAMAGES RESULTING
                                FROM YOUR USE OF THE SERVICE, INCLUDING BUT NOT LIMITED TO DATA LOSS,
                                SECURITY BREACHES, OR INACCURACIES IN DATA IDENTIFICATION. IN NO
                                EVENT SHALL DATAMAP OR ITS CREATORS BE HELD LIABLE FOR ANY DAMAGES
                                OUT OF OR IN CONNECTION WITH THE USE OR INABILITY TO USE THE
                                SERVICE.
                            </strong>
                        </p>
                        <h2 style={{ marginTop: "2rem", marginBottom: "1rem", color: "#fff", fontSize: "1.5rem", fontWeight: "600" }}>
                            4. User Responsibilities
                        </h2>
                        <p style={{ marginBottom: "1.5rem" }}>
                            You are responsible for maintaining the confidentiality of your account
                            and assessing the security of the services identified by DataMap. We
                            do not delete accounts on your behalf; we only provide information to
                            assist you in finding them.
                        </p>
                    </div>
                </div>
            </div>
        </main>
    );
}
