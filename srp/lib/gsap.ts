// GSAP for the marketing pages only (D29). Imported by client components;
// registering the plugins here once keeps every island on the same instance.
// GSAP 3.13+ ships ScrollTrigger and SplitText free under its standard
// license.
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);

export { gsap, ScrollTrigger, SplitText, useGSAP };

// Every scroll-driven animation is gated on this (DESIGN.md A10).
export const MOTION_OK = "(prefers-reduced-motion: no-preference)";
