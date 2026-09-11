import { Link, redirect } from "react-router";
import {
  ArrowRightIcon,
  BanIcon,
  Building2Icon,
  CheckCircle2Icon,
  CopyCheckIcon,
  CreditCardIcon,
  LaptopIcon,
  ScanLineIcon,
  SmartphoneIcon,
  TimerIcon,
  type LucideIcon,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

import type { Route } from "./+types/landing";
import { Logo } from "~/components/logo";
import { Button } from "~/components/ui/button";
import { tokens } from "~/lib/api";
import { BRAND, pageTitle } from "~/lib/brand";

export const meta: Route.MetaFunction = () => [{ title: pageTitle() }, { name: "description", content: BRAND.description }];

// logged in already? straight to work
export async function clientLoader() {
  if (tokens.access) throw redirect("/dashboard");
  return null;
}

const STEPS = [
  { title: "Sign up your school", text: "Create your school in a minute. You get a join code for your students." },
  { title: "Students get their QR", text: "They join with the code and show a QR on their phone, or you print ID cards." },
  { title: "Scan at the door", text: "Open a session, point any laptop camera at the QR. Attendance is done." },
];

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: SmartphoneIcon, title: "Phone or card", text: "Every student can have a printed card and a phone QR. Both work, and each can be replaced on its own." },
  { icon: LaptopIcon, title: "No hardware", text: "The scanner is a web page. Any laptop with a camera, or a USB barcode scanner, works." },
  { icon: CopyCheckIcon, title: "One scan, one check-in", text: "The database makes duplicates impossible, even when two scans arrive at the same moment." },
  { icon: TimerIcon, title: "Sessions close themselves", text: "Late scans are refused automatically, checked against the server clock rather than a laptop's." },
  { icon: BanIcon, title: "Lost card? Revoke it", text: "One click kills the old QR and issues a new one. The old QR stops working immediately." },
  { icon: Building2Icon, title: "Each school kept separate", text: "Schools never see each other's students, sessions or cards. It's enforced on every request." },
];

export default function Landing() {
  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
          <Link to="/" aria-label={`${BRAND.name} home`}>
            <Logo />
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/register">Join your school</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/login">Log in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/signup">Start free</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 -top-40 -z-10 mx-auto h-[36rem] max-w-4xl rounded-full bg-primary/15 blur-3xl" />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:grid-cols-2 md:px-6 md:py-24">
          <div className="grid gap-6">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-lime-500" /> For schools, colleges and institutes
            </span>
            <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Say <span className="text-primary">present</span> with a scan.
            </h1>
            <p className="max-w-lg text-lg text-pretty text-muted-foreground">
              {BRAND.name} replaces the roll call. Students show a QR on their card or phone, the teacher's laptop scans it,
              and attendance is recorded before the bell stops ringing.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/signup">
                  Start free for your school <ArrowRightIcon />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/register">I'm a student</Link>
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">No credit card. No hardware. Set up in a minute.</p>
          </div>
          <HeroVisual />
        </div>
      </section>

      {/* how it works */}
      <section className="border-y bg-muted/40">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight">Three steps. No more roll calls.</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="rounded-2xl border bg-background p-6">
                <span className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {i + 1}
                </span>
                <h3 className="mt-4 font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* features */}
      <section className="mx-auto max-w-6xl px-4 py-16 md:px-6">
        <h2 className="text-3xl font-bold tracking-tight">Built for a real classroom</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">Designed around the things that go wrong: lost cards, late students, buddy check-ins and shared phones.</p>
        <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <f.icon className="size-5" />
              </div>
              <div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* the name */}
      <section className="mx-auto max-w-6xl px-4 md:px-6">
        <figure className="rounded-2xl border bg-muted/40 p-8 text-center md:p-12">
          <p className="text-5xl font-bold tracking-tight md:text-6xl">हाजिर</p>
          <figcaption className="mt-4 text-muted-foreground">
            <span className="font-medium text-foreground">hajir</span> /ha·jir/: what you say when the teacher calls your name. "Present!"
          </figcaption>
        </figure>
      </section>

      {/* final CTA */}
      <section className="mx-auto max-w-6xl px-4 py-16 md:px-6">
        <div className="flex flex-col items-start justify-between gap-6 rounded-2xl bg-primary px-8 py-10 text-primary-foreground md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl">Your next roll call can take 30 seconds.</h2>
            <p className="mt-1 text-primary-foreground/80">Set up your school now, then invite students with one code.</p>
          </div>
          <Button asChild size="lg" variant="secondary">
            <Link to="/signup">
              Start free <ArrowRightIcon />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row md:px-6">
          <Logo className="text-base" markClassName="size-6" />
          <p>
            © {new Date().getFullYear()} {BRAND.name}. {BRAND.tagline}
          </p>
        </div>
      </footer>
    </div>
  );
}

// a phone showing a student's QR, and the scanner's "checked in" result next to it
function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-sm md:max-w-none">
      <div className="mx-auto w-64 rounded-[2.5rem] border-8 border-neutral-900 bg-neutral-900 shadow-2xl">
        <div className="overflow-hidden rounded-[2rem] bg-white px-5 pt-8 pb-6 text-neutral-900">
          <p className="text-center text-xs font-medium tracking-wide text-neutral-500 uppercase">My QR</p>
          <div className="mt-4 rounded-2xl border p-3">
            <QRCodeSVG value="https://hajir.app/demo" size={512} marginSize={1} className="h-auto w-full" fgColor="#1e1b4b" />
          </div>
          <p className="mt-4 text-center font-semibold">Sita Kumari</p>
          <p className="text-center text-xs text-neutral-500">Sunrise Academy</p>
        </div>
      </div>

      <div className="absolute -bottom-4 left-0 w-60 rounded-xl border bg-background p-3 shadow-xl sm:-left-6 md:-left-10">
        <div className="flex items-center gap-3">
          <CheckCircle2Icon className="size-8 shrink-0 text-emerald-600" />
          <div className="min-w-0 text-sm">
            <p className="font-semibold">Checked in</p>
            <p className="truncate text-muted-foreground">Sita Kumari · Math 101</p>
          </div>
        </div>
      </div>

      <div className="absolute top-8 right-0 hidden items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs font-medium shadow-lg sm:flex md:-right-4">
        <ScanLineIcon className="size-3.5 text-primary" /> 28 / 30 present
      </div>
      <div className="absolute top-24 -left-2 hidden items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs font-medium shadow-lg lg:flex">
        <CreditCardIcon className="size-3.5 text-primary" /> Cards work too
      </div>
    </div>
  );
}
