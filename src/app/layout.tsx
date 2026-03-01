import "~/styles/globals.css";

import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { SessionProvider } from "next-auth/react";

export const metadata: Metadata = {
	title: "DataMap",
	description: "Map your digital footprint and find forgotten accounts.",
	icons: [{ rel: "icon", url: "/logo.svg" }],
};

const geist = Geist({
	subsets: ["latin"],
});

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body className={geist.className} suppressHydrationWarning>
				<SessionProvider basePath="/Backend/api/auth">
					{children}
				</SessionProvider>
			</body>
		</html>
	);
}
