import Logo from "./Logo";

/**
 * Opening animation. Server-rendered and driven purely by CSS (globals.css,
 * .splash*), so it paints with the first HTML byte — before the map bundle
 * loads — and removes itself without JavaScript. The inline script skips it
 * for the rest of the browser session once it has played.
 */
export default function Splash() {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html:
            "try{if(sessionStorage.getItem('dn-splash'))document.documentElement.dataset.splash='seen';else sessionStorage.setItem('dn-splash','1')}catch(e){}",
        }}
      />
      <div className="splash" aria-hidden>
        <div className="splash-rays" />
        <div className="splash-logo">
          <Logo size={132} animated />
        </div>
        <p className="splash-title font-display">Discover Nashik</p>
        <p className="splash-sub">कुंभ मार्गदर्शक · कुंभ गाइड · Kumbh guide</p>
        <div className="splash-bar"><span /></div>
      </div>
    </>
  );
}
