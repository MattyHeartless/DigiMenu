"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import type { PublicMenu } from "../../components/data";
import "./viuda-negra.css";

type Direction = 1 | -1;
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5099";

export default function ViudaNegraMenu({ menu }: { menu: PublicMenu }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [showBusinessLogo, setShowBusinessLogo] = useState(Boolean(menu.business.logoUrl));
  const vinylRef = useRef<HTMLImageElement>(null);
  const tonearmRef = useRef<HTMLImageElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const productsRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const rotationRef = useRef(0);
  const transitioningRef = useRef(false);

  const category = menu.categories[activeIndex] ?? menu.categories[0];
  const products = useMemo(
    () => category.products.filter(product => product.isAvailable).sort((a, b) => a.displayOrder - b.displayOrder),
    [category]
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(media.matches);
    updatePreference();
    media.addEventListener("change", updatePreference);
    return () => media.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    if (reducedMotion || !contentRef.current) return;
    const context = gsap.context(() => {
      gsap.fromTo(contentRef.current, { autoAlpha: 0, x: 22 }, { autoAlpha: 1, x: 0, duration: 0.56, ease: "power3.out", delay: 0.12 });
    });
    return () => context.revert();
  }, [reducedMotion]);

  useEffect(() => () => { timelineRef.current?.kill(); transitioningRef.current = false; }, []);

  function resetProductsScroll() {
    productsRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }

  function navigate(direction: Direction) {
    if (isTransitioning || transitioningRef.current || menu.categories.length < 2 || !contentRef.current) return;

    const nextIndex = (activeIndex + direction + menu.categories.length) % menu.categories.length;
    const outgoingX = direction === 1 ? -28 : 28;
    const incomingX = direction === 1 ? 28 : -28;
    const content = contentRef.current;
    const vinyl = vinylRef.current;
    const tonearm = tonearmRef.current;

    transitioningRef.current = true;
    setIsTransitioning(true);
    timelineRef.current?.kill();

    if (reducedMotion || !vinyl) {
      timelineRef.current = gsap.timeline({ onComplete: () => { transitioningRef.current = false; setIsTransitioning(false); timelineRef.current = null; } })
        .to(content, { autoAlpha: 0, duration: 0.16, ease: "power1.out" })
        .call(() => { resetProductsScroll(); setActiveIndex(nextIndex); })
        .to(content, { autoAlpha: 1, duration: 0.2, ease: "power1.out" });
      return;
    }

    const nextRotation = rotationRef.current + direction * 300;
    timelineRef.current = gsap.timeline({
      defaults: { overwrite: "auto" },
      onComplete: () => { transitioningRef.current = false; setIsTransitioning(false); timelineRef.current = null; }
    })
      .to(content, { autoAlpha: 0, x: outgoingX, duration: 0.24, ease: "power2.in" }, 0)
      .to(tonearm, { rotation: 5, y: -5, duration: 0.18, ease: "power2.out", transformOrigin: "80% 26%" }, 0.2)
      .to(vinyl, { rotation: nextRotation, duration: 0.6, ease: "power2.inOut", transformOrigin: "50% 50%" }, 0.2)
      .call(() => { rotationRef.current = nextRotation; resetProductsScroll(); setActiveIndex(nextIndex); }, [], 0.5)
      .to(tonearm, { rotation: 0, y: 0, duration: 0.28, ease: "power2.inOut", transformOrigin: "80% 26%" }, 0.56)
      .set(content, { x: incomingX }, 0.54)
      .to(content, { autoAlpha: 1, x: 0, duration: 0.4, ease: "power3.out" }, 0.64);
  }

  return <main className="vinyl-menu">
    <div className="vinyl-menu-grain" aria-hidden="true" />
    <header className="vinyl-header">
      <a className="vinyl-brand" href={`/${menu.business.slug}`} aria-label={`Inicio de ${menu.business.name}`}>
        <span className="vinyl-brand-mark">{showBusinessLogo ? <img src={`${apiUrl}/api/public/businesses/${menu.business.slug}/logo`} alt={`Logo de ${menu.business.name}`} onError={() => setShowBusinessLogo(false)} /> : <span aria-hidden="true">✦</span>}</span>
        <span><small>RESTAURANT · BAR</small><b>{menu.business.name}</b></span>
      </a>
      <a className="vinyl-pdf-link" href={`/${menu.business.slug}/pdf`}>Ver menú PDF</a>
    </header>

    <section className="vinyl-stage" aria-label="Menú por categoría">
      <div className="vinyl-crop" aria-hidden="true">
        <div className="vinyl-disc-positioner">
          <img ref={vinylRef} className="vinyl-disc" src="/viuda-negra-vinyl-disc.png" alt="" />
          <span className="vinyl-shine" />
        </div>
        <img ref={tonearmRef} className="vinyl-tonearm" src="/viuda-negra-tonearm.png" alt="" />
      </div>

      <section className="vinyl-content" ref={contentRef} aria-live="polite" aria-atomic="true">
        <p className="vinyl-overline">PISTA {String(category.displayOrder).padStart(2, "0")}</p>
        <h1>{category.name}</h1>
        {category.description && <p className="vinyl-category-description">{category.description}</p>}
        <div className="vinyl-products" ref={productsRef} aria-label={`Productos de ${category.name}`}>
          {products.map(product => <article className="vinyl-product" key={product.id}>
            <div><h2>{product.name}</h2>{product.description && <p>{product.description}</p>}</div>
            <strong aria-label={`${product.name}, ${product.price} pesos`}>${product.price.toFixed(0)}</strong>
          </article>)}
        </div>
      </section>

      <nav className="vinyl-navigation" aria-label="Navegación de categorías">
        <button type="button" onClick={() => navigate(-1)} disabled={isTransitioning} aria-label="Categoría anterior"><span aria-hidden="true">←</span><small>Anterior</small></button>
        <p><b>{String(activeIndex + 1).padStart(2, "0")}</b><span> / {String(menu.categories.length).padStart(2, "0")}</span></p>
        <button type="button" onClick={() => navigate(1)} disabled={isTransitioning} aria-label="Categoría siguiente"><small>Siguiente</small><span aria-hidden="true">→</span></button>
      </nav>
    </section>

    <footer className="vinyl-footer">VIUDA NEGRA <b>✦</b> GUADALAJARA</footer>
  </main>;
}
