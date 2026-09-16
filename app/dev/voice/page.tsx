"use client";
// TEMPORARY manual-test harness for lib/voice. Not part of the product.
import { useEffect, useRef, useState } from "react";
import { useVoiceAssistant } from "@/lib/voice";
import type { Lang } from "@/types";

export default function VoiceDevPage() {
  const v = useVoiceAssistant();
  const [text, setText] = useState("रामकुंड कुठे आहे");
  const [log, setLog] = useState<string[]>([]);
  const prev = useRef<string>("");

  useEffect(() => {
    if (prev.current !== v.state) {
      prev.current = v.state;
      setLog((l) => [...l, `${new Date().toISOString().slice(11, 23)}  state=${v.state}`]);
    }
  }, [v.state]);

  return (
    <main style={{ fontFamily: "system-ui", padding: 16, maxWidth: 420 }}>
      <h1>voice harness</h1>
      <div id="state" data-state={v.state}>state: <b>{v.state}</b></div>
      <div id="lang">lang: <b>{v.lang}</b></div>
      <div id="transcript">transcript: {v.transcript}</div>
      <div id="answer">answer: {v.answer}</div>
      <div id="placeIds">placeIds: {JSON.stringify(v.placeIds)}</div>
      <hr />
      {(["en-IN", "hi-IN", "mr-IN"] as Lang[]).map((l) => (
        <button key={l} id={`lang-${l}`} onClick={() => v.setLang(l)}>{l}</button>
      ))}
      <hr />
      <input id="q" value={text} onChange={(e) => setText(e.target.value)} style={{ width: "100%" }} />
      <button id="ask" onClick={() => void v.ask(text)}>ask()</button>
      <button id="start" onClick={() => v.start()}>start()</button>
      <button id="stop" onClick={() => v.stop()}>stop()</button>
      <pre id="log" style={{ fontSize: 11, background: "#eee", padding: 8 }}>{log.join("\n")}</pre>
    </main>
  );
}
