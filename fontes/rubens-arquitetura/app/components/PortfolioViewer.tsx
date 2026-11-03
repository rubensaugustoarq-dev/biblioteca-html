"use client";

import { useRef } from "react";

export function PortfolioViewer({ src, alt }: { src: string; alt: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        className="portfolio-preview"
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-label="Ampliar apresentação completa"
      >
        <img
          src={src}
          alt={alt}
          width="2400"
          height="1662"
          loading="lazy"
          decoding="async"
        />
        <span>Ampliar apresentação ↗</span>
      </button>
      <dialog
        className="portfolio-dialog"
        ref={dialogRef}
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Fechar apresentação"
        >
          ×
        </button>
        <div>
          <img src={src} alt={alt} width="2400" height="1662" />
        </div>
      </dialog>
    </>
  );
}
