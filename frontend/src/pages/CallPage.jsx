import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router";
import useAuthUser from "../hooks/useAuthUser";
import { useQuery } from "@tanstack/react-query";
import { getStreamToken } from "../lib/api";

import {
  StreamVideo,
  StreamVideoClient,
  StreamCall,
  CallControls,
  SpeakerLayout,
  StreamTheme,
  CallingState,
  useCallStateHooks,
  useCall,
} from "@stream-io/video-react-sdk";

import "@stream-io/video-react-sdk/dist/css/styles.css";
import toast from "react-hot-toast";
import PageLoader from "../components/PageLoader";

const STREAM_API_KEY = import.meta.env.VITE_STREAM_API_KEY;

const SubtitleOverlay = ({ subtitle }) => (
  <div
    style={{
      position: "absolute",
      bottom: 32,
      left: 0,
      right: 0,
      textAlign: "center",
      zIndex: 20,
      pointerEvents: "none",
    }}
    className="w-full flex justify-center"
  >
    <span
      className="bg-black bg-opacity-70 text-white px-4 py-2 rounded text-lg shadow-lg max-w-2xl inline-block"
      style={{
        maxWidth: "80vw",
        overflowWrap: "break-word",
      }}
    >
      {subtitle}
    </span>
  </div>
);

const ToggleTranscriptionButton = ({ onToggle, isEnabled, speechLanguage, onLanguageChange }) => {
  const call = useCall();
  const { useCallSettings, useIsCallTranscribingInProgress } = useCallStateHooks();
  const { transcription } = useCallSettings() || {};
  if (transcription?.mode === "disabled") return null;
  const isTranscribing = useIsCallTranscribingInProgress();

  return (
    <div className="absolute top-4 right-4 z-30 flex gap-2">
      <select
        value={speechLanguage}
        onChange={(e) => onLanguageChange(e.target.value)}
        className="px-3 py-2 rounded bg-white text-gray-900 border shadow text-sm"
        disabled={isTranscribing || isEnabled}
      >
        <option value="en-US">English</option>
        <option value="tr-TR">Turkish</option>
      </select>
      <button
        onClick={() => {
          if (isTranscribing || isEnabled) {
            call?.stopTranscription().catch((err) => {
              console.log("Failed to stop transcriptions", err);
            });
            onToggle(false);
          } else {
            call?.startTranscription().catch((err) => {
              console.error("Failed to start transcription", err);
            });
            onToggle(true);
          }
        }}
        className={`px-4 py-2 rounded font-semibold shadow transition-colors ${(isTranscribing || isEnabled) ? "bg-red-600 text-white" : "bg-green-600 text-white"}`}
        style={{ minWidth: 160 }}
      >
        {(isTranscribing || isEnabled) ? "Disable Subtitles" : "Enable Subtitles"}
      </button>
    </div>
  );
};

const CallPage = () => {
  const { id: callId } = useParams();
  const [client, setClient] = useState(null);
  const [call, setCall] = useState(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [transcriptionText, setTranscriptionText] = useState("");
  const [webSpeechRecognition, setWebSpeechRecognition] = useState(null);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
  const webSpeechInitialized = useRef(false);
  const isRecognitionActive = useRef(false);
  const [callReady, setCallReady] = useState(false);
  const restartTimerRef = useRef(null);
  const lastSpeechErrorRef = useRef(null);
  const [micReady, setMicReady] = useState(false);
  const [hasMicDevice, setHasMicDevice] = useState(true);
  const [speechLanguage, setSpeechLanguage] = useState('en-US');

  const { authUser, isLoading } = useAuthUser();

  const { data: tokenData } = useQuery({
    queryKey: ["streamToken"],
    queryFn: getStreamToken,
    enabled: !!authUser,
  });

  // Ask for mic permission helper (hoisted above effects)
  const ensureMicPermission = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) return false;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicReady(true);
      return true;
    } catch (e) {
      setMicReady(false);
      toast.error("Please allow microphone access in your browser");
      return false;
    }
  };

  // Stream Video Call setup
  useEffect(() => {
    const initCall = async () => {
      if (!tokenData || !tokenData.token || !authUser || !callId) return;
      try {
        console.log("Initializing Stream video client...");
        const user = {
          id: authUser._id,
          name: authUser.fullName,
          image: authUser.profilePic,
        };
        const videoClient = new StreamVideoClient({
          apiKey: STREAM_API_KEY,
          user,
          token: tokenData.token,
          options: {
            enable_insights: true,
            enable_transcription: true,
            transcription: {
              mode: "available",
              language: "en",
            },
          },
        });
        const callInstance = videoClient.call("default", callId);

        // Non-blocking mic permission prompt during join
        try {
          if (navigator.mediaDevices?.getUserMedia) {
            const p = navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
              try { stream.getTracks().forEach((t) => t.stop()); } catch (_) { }
              setMicReady(true);
              return true;
            }).catch(() => false);
            await Promise.race([p, new Promise((resolve) => setTimeout(() => resolve(false), 1500))]);
          }
        } catch (_) {
          // Ignore; join should proceed regardless of mic
        }

        // Try to join existing call first, create if it doesn't exist
        try {
          await callInstance.join({
            create: false,
            data: {
              transcription: {
                mode: "available",
                enabled: true,
                language: "en",
                auto_start: true,
              },
            },
          });
          console.log("Joined existing call");
        } catch (error) {
          console.log("Call doesn't exist, creating new call");
          await callInstance.join({
            create: true,
            data: {
              transcription: {
                mode: "available",
                enabled: true,
                language: "en",
                auto_start: true,
              },
            },
          });
          console.log("Created new call");
        }
        console.log("Joined call successfully");

        // Enable transcription by default
        try {
          console.log("Attempting to start transcription...");
          const transcriptionResult = await callInstance.startTranscription();
          console.log("Transcription start result:", transcriptionResult);
          console.log("Transcription enabled by default");

          // Check transcription status
          const transcriptionStatus = callInstance.state.transcription;
          console.log("Transcription status:", transcriptionStatus);

          // Check if transcription is actually enabled
          setTimeout(() => {
            console.log("Transcription status after delay:", callInstance.state.transcription);
            console.log("Call state:", callInstance.state);
            console.log("Call settings after delay:", callInstance.state.settings);
          }, 2000);
        } catch (error) {
          console.log("Could not enable transcription by default:", error);
          console.log("Error details:", error.message, error.stack);
        }

        setClient(videoClient);
        setCall(callInstance);
        setCallReady(true);

        // Set up transcription event listeners
        callInstance.on("transcription.updated", (event) => {
          console.log("Transcription updated event:", event);
          if (event?.text) {
            setTranscriptionText(event.text);
          }
        });

        callInstance.on("transcription.started", () => {
          console.log("Transcription started");
          setTranscriptionText("🎤 Listening... Speak now!");
        });

        callInstance.on("transcription.stopped", () => {
          console.log("Transcription stopped");
          setTranscriptionText("");
        });

        // Listen for all events to debug
        callInstance.on("*", (event) => {
          console.log("All call events:", event);
          if (event.type && event.type.includes("transcription")) {
            console.log("Transcription-related event:", event);
          }
        });

        // Subscribe to the transcribing observable if it exists
        if (callInstance.transcribing$) {
          const transcribingSubscription = callInstance.transcribing$.subscribe((transcribing) => {
            console.log("Transcribing observable:", transcribing);
            if (transcribing) {
              setTranscriptionText("🎤 Transcription is active - speak now!");
            }
          });
        }

        // Subscribe to closed captions observable if it exists
        if (callInstance.closedCaptions$) {
          const closedCaptionsSubscription = callInstance.closedCaptions$.subscribe((captions) => {
            console.log("Closed captions observable:", captions);
            if (captions?.text) {
              setTranscriptionText(captions.text);
            }
          });
        }

        // Also try to get transcription status from call state
        console.log("Call instance methods:", Object.getOwnPropertyNames(callInstance));
        console.log("Call instance state keys:", Object.keys(callInstance.state || {}));

        // Check if transcription methods exist
        console.log("startTranscription method exists:", typeof callInstance.startTranscription);
        console.log("stopTranscription method exists:", typeof callInstance.stopTranscription);
        console.log("transcribing$ exists:", !!callInstance.transcribing$);
        console.log("closedCaptions$ exists:", !!callInstance.closedCaptions$);

      } catch (error) {
        console.error("Error joining call:", error);
        toast.error("Could not join the call. Please try again.");
      } finally {
        setIsConnecting(false);
      }
    };
    initCall();

    // Cleanup function
    return () => {
      if (webSpeechRecognition) {
        webSpeechRecognition.stop();
      }
    };
  }, [tokenData, authUser, callId]);

  // Check mic devices and request permission helper
  useEffect(() => {
    const checkDevices = async () => {
      try {
        const devices = await navigator.mediaDevices?.enumerateDevices?.();
        const hasAudioInput = Array.isArray(devices) && devices.some((d) => d.kind === 'audioinput');
        setHasMicDevice(hasAudioInput);
      } catch (e) {
        // ignore
      }
    };
    checkDevices();
    const onDeviceChange = () => checkDevices();
    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);
      return () => navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange);
    }
  }, []);

  // Set up Web Speech API after call is ready
  useEffect(() => {
    if (callReady && !webSpeechInitialized.current && !webSpeechRecognition && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      webSpeechInitialized.current = true;
      try {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();

        recognition.continuous = true;
        recognition.interimResults = true;
        // Use the selected language or default to English
        recognition.lang = speechLanguage;

        recognition.onstart = () => {
          console.log("Web Speech API started for user:", authUser?.fullName);
          setTranscriptionText("🎤 Web Speech API listening...");
          isRecognitionActive.current = true;
        };

        recognition.onresult = (event) => {
          let finalTranscript = '';
          let interimTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript;
            } else {
              interimTranscript += transcript;
            }
          }

          if (finalTranscript) {
            console.log("Web Speech API final result:", finalTranscript);
            setTranscriptionText(finalTranscript);
          } else if (interimTranscript) {
            console.log("Web Speech API interim result:", interimTranscript);
            setTranscriptionText(interimTranscript);
          }
        };

        recognition.onerror = (event) => {
          console.log("Web Speech API error:", event.error);
          lastSpeechErrorRef.current = event.error;
          // Restart only on no-speech/audio-capture, not on aborted
          if ((event.error === 'no-speech' || event.error === 'audio-capture') && subtitlesEnabled && callReady && document.visibilityState === 'visible') {
            try { recognition.stop(); } catch (_) { }
            clearTimeout(restartTimerRef.current);
            restartTimerRef.current = setTimeout(() => {
              try { if (!isRecognitionActive.current) recognition.start(); } catch (e) { console.log('Restart error:', e?.message || e); }
            }, 1500);
          }
        };

        recognition.onend = () => {
          console.log("Web Speech API ended");
          isRecognitionActive.current = false;
          // Keep running while subtitles are enabled, call is ready, and tab is visible
          if (subtitlesEnabled && callReady && document.visibilityState === 'visible' && lastSpeechErrorRef.current !== 'aborted') {
            clearTimeout(restartTimerRef.current);
            restartTimerRef.current = setTimeout(() => {
              try { if (!isRecognitionActive.current) recognition.start(); } catch (e) { console.log('Auto-restart error:', e?.message || e); }
            }, 1200);
          }
        };

        setWebSpeechRecognition(recognition);
      } catch (error) {
        console.log("Error setting up Web Speech API:", error);
      }
    }
  }, [webSpeechRecognition, authUser, subtitlesEnabled, callReady, speechLanguage]);

  // Update recognition language when speechLanguage changes
  useEffect(() => {
    if (webSpeechRecognition && speechLanguage) {
      webSpeechRecognition.lang = speechLanguage;
      // Restart recognition if it's currently active to apply the new language
      if (isRecognitionActive.current && subtitlesEnabled && callReady) {
        try {
          webSpeechRecognition.stop();
          setTimeout(() => {
            try {
              if (!isRecognitionActive.current) webSpeechRecognition.start();
            } catch (e) {
              console.log('Language change restart error:', e?.message || e);
            }
          }, 500);
        } catch (e) {
          console.log('Language change stop error:', e?.message || e);
        }
      }
    }
  }, [speechLanguage, webSpeechRecognition, subtitlesEnabled, callReady]);

  // Start/stop recognition based on UI toggle and call readiness
  useEffect(() => {
    if (!webSpeechRecognition) return;
    if (subtitlesEnabled && callReady && micReady) {
      if (!hasMicDevice) {
        toast.error("No microphone found. Connect a mic to use subtitles.");
        return;
      }
      ensureMicPermission().then((ok) => {
        if (!ok) return;
        try {
          if (!isRecognitionActive.current) webSpeechRecognition.start();
        } catch (error) {
          console.log('Start recognition error:', error);
        }
      });
    } else {
      try {
        if (isRecognitionActive.current) webSpeechRecognition.stop();
      } catch (error) {
        console.log('Stop recognition error:', error);
      }
    }
  }, [subtitlesEnabled, webSpeechRecognition, callReady, hasMicDevice, micReady]);

  // Pause recognition when tab hidden; resume when visible and allowed
  useEffect(() => {
    const onVisibility = () => {
      if (!webSpeechRecognition) return;
      if (document.visibilityState === 'hidden') {
        try { if (isRecognitionActive.current) webSpeechRecognition.stop(); } catch (_) { }
      } else if (document.visibilityState === 'visible') {
        if (subtitlesEnabled && callReady && micReady) {
          try { if (!isRecognitionActive.current) webSpeechRecognition.start(); } catch (_) { }
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [webSpeechRecognition, subtitlesEnabled, callReady, micReady]);

  // Clear transcription text when subtitles are disabled
  useEffect(() => {
    if (!subtitlesEnabled) {
      setTranscriptionText("");
    }
  }, [subtitlesEnabled]);

  if (isLoading || isConnecting) return <PageLoader />;

  return (
    <div className="h-screen flex flex-col items-center justify-center">
      <div className="relative">
        {client && call ? (
          <StreamVideo client={client}>
            <StreamCall call={call}>
              <CallContent
                transcriptionText={transcriptionText}
                subtitlesEnabled={subtitlesEnabled}
                onToggleSubtitles={setSubtitlesEnabled}
                speechLanguage={speechLanguage}
                onLanguageChange={setSpeechLanguage}
              />
            </StreamCall>
          </StreamVideo>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p>Could not initialize call. Please refresh or try again later.</p>
          </div>
        )}
      </div>
    </div>
  );
};

const CallContent = ({ transcriptionText, subtitlesEnabled, onToggleSubtitles, speechLanguage, onLanguageChange }) => {
  const { useCallCallingState, useCallSettings } = useCallStateHooks();
  const callingState = useCallCallingState();
  const callSettings = useCallSettings();
  const navigate = useNavigate();

  console.log("Call settings:", callSettings);
  console.log("Transcription text:", transcriptionText);
  console.log("Subtitles enabled:", subtitlesEnabled);

  if (callingState === CallingState.LEFT) return navigate("/");

  return (
    <StreamTheme>
      <div className="relative w-full h-full">
        <SpeakerLayout />
        <CallControls />
        <ToggleTranscriptionButton
          onToggle={onToggleSubtitles}
          isEnabled={subtitlesEnabled}
          speechLanguage={speechLanguage}
          onLanguageChange={onLanguageChange}
        />
        {subtitlesEnabled && (
          <SubtitleOverlay subtitle={transcriptionText || "🎤 Web Speech API ready - speak to see live subtitles..."} />
        )}
      </div>
    </StreamTheme>
  );
};

export default CallPage;