import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import styles from "../page.module.css";

export default function ContactPage() {
    return (
        <main className={styles.main}>
            <div style={{ position: "relative", zIndex: 10, maxWidth: "600px", margin: "0 auto", padding: "4rem 5%" }}>
                <Link
                    href="/"
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

                <div
                    style={{
                        background: "rgba(25, 25, 30, 0.6)",
                        backdropFilter: "blur(20px)",
                        border: "1px solid rgba(255, 255, 255, 0.05)",
                        borderRadius: "24px",
                        padding: "3rem",
                        textAlign: "center",
                        marginTop: "1rem",
                    }}
                >
                    <div
                        className={styles.stepIcon}
                        style={{
                            margin: "0 auto 1.5rem",
                        }}
                    >
                        <Mail size={28} />
                    </div>
                    <h1 className={styles.title} style={{ fontSize: "2.5rem", margin: "0 0 1rem 0" }}>Get in Touch</h1>
                    <p style={{ color: "#8a8f98", marginBottom: "2.5rem", fontSize: "1.1rem", lineHeight: "1.6" }}>
                        Have questions about your data privacy or need support with your
                        account? Send us an email.
                    </p>
                    <a
                        href="mailto:Datamap@datamap.com"
                        className={styles.ctaButton}
                        style={{
                            display: "inline-block",
                            textDecoration: "none",
                        }}
                    >
                        Datamap@datamap.com
                    </a>
                </div>
            </div>
        </main>
    );
}
