"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Page() {
  const router = useRouter();

  useEffect(() => {router.push('/Frontend'); }, [router]);

  return <div style={{
	backgroundColor: 'black',
	height: '100vh',
	width: '100vw',
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center',
	color: 'white',
	position: 'fixed',
	top: 0,
	left: 0
  }}/>;
}