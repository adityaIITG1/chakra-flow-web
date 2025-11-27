import cv2
import mediapipe as mp
import numpy as np
import time
import math
import pygame
import os
import random
import speech_recognition as sr
import pyttsx3
import ai_explainer

# ============================================================
#   AI CHAKRAFLOW — FULL VERSION (MUSIC + VOICE + SUMMARY)
#   BILINGUAL (Hindi + English)
# ============================================================

CAM_INDEX = 0
# Slightly larger 16:9 frame; still modest to keep lag low.
FRAME_WIDTH = 1120
FRAME_HEIGHT = 630

# ---- Path to your Adiyogi music ----
MUSIC_PATH = r"C:\Users\ASUS\OneDrive\Desktop\Yoga_AI\Adiyogi The Source of Yog-320kbps.mp3"

# Chakra definitions (bottom to top)
CHAKRA_NAMES = [
    "Root", "Sacral", "Solar Plexus", "Heart",
    "Throat", "Third Eye", "Crown"
]

CHAKRA_COLORS = [
    (0,   0, 255),   # Root    - Red
    (0, 140, 255),   # Sacral  - Orange
    (0, 255, 255),   # Solar   - Yellow
    (0, 255,   0),   # Heart   - Green
    (255, 0,   0),   # Throat  - Blue (BGR)
    (255, 0, 255),   # Third   - Violet
    (255, 255, 255)  # Crown   - White
]

# Short scripture-like snippets per chakra for AI explainer (safe, brief)
CHAKRA_SCRIPTURES = [
    {
        "id": "root_balance",
        "source": "Yoga wisdom",
        "sanskrit": "Sthiram sukham asanam",
        "hinglish": "Stay steady like a mountain",
        "meaning": "Ground yourself and find steadiness."
    },
    {
        "id": "sacral_flow",
        "source": "Yoga wisdom",
        "sanskrit": "Jala tattva",
        "hinglish": "Gentle flow, soft breath",
        "meaning": "Let movement be smooth and creative."
    },
    {
        "id": "solar_fire",
        "source": "Yoga wisdom",
        "sanskrit": "Tejas",
        "hinglish": "Inner fire with calm mind",
        "meaning": "Strength with kindness—no force."
    },
    {
        "id": "heart_compassion",
        "source": "Yoga wisdom",
        "sanskrit": "Anahata",
        "hinglish": "Open heart, light shoulders",
        "meaning": "Balance effort with softness and care."
    },
    {
        "id": "throat_truth",
        "source": "Yoga wisdom",
        "sanskrit": "Satya",
        "hinglish": "Speak softly, breathe freely",
        "meaning": "Align breath and voice with honesty."
    },
    {
        "id": "third_eye_focus",
        "source": "Yoga wisdom",
        "sanskrit": "Dhyana",
        "hinglish": "Drishti shant rakho",
        "meaning": "Calm gaze, clear mind, steady breath."
    },
    {
        "id": "crown_stillness",
        "source": "Yoga wisdom",
        "sanskrit": "Shanti",
        "hinglish": "Sukoon se baitho",
        "meaning": "Sit in quiet awareness; no hurry, no pressure."
    },
]
# Thresholds
EYE_CLOSED_THRESHOLD = 0.012 # Lowered from 0.018 to fix false positives
EYE_CLOSED_FRAMES_REQUIRED = 15
  # ~1.5s

AI_REFRESH_SECS = 6  # refresh AI tip every few seconds

# ---------------- Pygame audio init -----------------
pygame.mixer.init(frequency=44100, size=-16, channels=2, buffer=512)

# ---------------- TTS (Indian-ish female voice) -----------------
tts = pyttsx3.init()
voices = tts.getProperty('voices')
for v in voices:
    name_lower = v.name.lower()
    if "female" in name_lower or "zira" in name_lower or "hindi" in v.id.lower():
        tts.setProperty('voice', v.id)
        break
tts.setProperty('rate', 178)
tts.setProperty('volume', 1.0)

# ---------------- Mediapipe -----------------
mp_hands = mp.solutions.hands
mp_face = mp.solutions.face_mesh
mp_pose = mp.solutions.pose
mp_drawing = mp.solutions.drawing_utils
mp_drawing_styles = mp.solutions.drawing_styles


# ===================== HELPERS =======================

def draw_text_with_bg(frame, text, x, y, font_scale=0.6, color=(255, 255, 255), thickness=1, bg_color=(0, 0, 0), bg_alpha=0.6):
    (text_w, text_h), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, font_scale, thickness)
    overlay = frame.copy()
    # Draw background rectangle
    cv2.rectangle(overlay, (x - 5, y - text_h - 5), (x + text_w + 5, y + 5), bg_color, -1)
    cv2.addWeighted(overlay, bg_alpha, frame, 1 - bg_alpha, 0, frame)
    cv2.putText(frame, text, (x, y), cv2.FONT_HERSHEY_SIMPLEX, font_scale, color, thickness, cv2.LINE_AA)

def get_finger_states(hand_landmarks, image_width, image_height):
    lm = hand_landmarks.landmark

    def to_pixel(idx):
        return int(lm[idx].x * image_width), int(lm[idx].y * image_height)

    tips = [4, 8, 12, 16, 20]
    pips = [3, 6, 10, 14, 18]

    states = {}

    thumb_tip_x, thumb_tip_y = to_pixel(4)
    thumb_pip_x, thumb_pip_y = to_pixel(3)
    states["thumb"] = thumb_tip_x > thumb_pip_x

    finger_names = ["index", "middle", "ring", "pinky"]
    for name, tip_idx, pip_idx in zip(finger_names, tips[1:], pips[1:]):
        tip_x, tip_y = to_pixel(tip_idx)
        pip_x, pip_y = to_pixel(pip_idx)
        states[name] = tip_y < pip_y

    return states


def detect_gyan_mudra(hand_landmarks, frame=None, width=0, height=0):
    lm = hand_landmarks.landmark
    thumb_tip = lm[4]
    index_tip = lm[8]
    wrist = lm[0]
    mid_tip = lm[12]
    
    # Normalize by hand size (wrist to middle fingertip) for scale tolerance
    hand_scale = math.sqrt((wrist.x - mid_tip.x) ** 2 + (wrist.y - mid_tip.y) ** 2) + 1e-6
    d = math.sqrt((thumb_tip.x - index_tip.x) ** 2 + (thumb_tip.y - index_tip.y) ** 2) / hand_scale
    
    # Visual Debugging (Draw line between thumb and index)
    if frame is not None:
        tx, ty = int(thumb_tip.x * width), int(thumb_tip.y * height)
        ix, iy = int(index_tip.x * width), int(index_tip.y * height)
        
        # Color code: Green=Active, Yellow=Close, Red=Far
        if d < 0.14: # Relaxed from 0.09 based on user feedback
            col = (0, 255, 0)
            cv2.circle(frame, (ix, iy), 8, (0, 255, 0), -1) # Dot on index tip
        elif d < 0.20:
            col = (0, 255, 255)
        else:
            col = (0, 0, 255)
            
        cv2.line(frame, (tx, ty), (ix, iy), col, 2)

    # Threshold tuned to 0.14
    return d < 0.14


def detect_open_palm(finger_states):
    return all(finger_states.values())


def detect_fist(finger_states):
    return not any(finger_states.values())


def detect_peace(hand_landmarks):
    # Index/middle extended, ring/pinky folded
    lm = hand_landmarks.landmark
    states = get_finger_states(hand_landmarks, 1, 1)
    return states["index"] and states["middle"] and not states["ring"] and not states["pinky"]


def classify_chakra_gesture(finger_states, gyan=False):
    t = finger_states["thumb"]
    i = finger_states["index"]
    m = finger_states["middle"]
    r = finger_states["ring"]
    p = finger_states["pinky"]

    # Gyan mudra -> Crown
    if gyan and m and r and p:
        return 6

    if not t and not i and not m and not r and not p:
        return 0  # Root

    if not t and i and m and not r and not p:
        return 1  # Sacral

    if t and i and m and r and p:
        return 2  # Solar

    if t and i and m and not r and not p:
        return 3  # Heart

    if not t and i and not m and not r and not p:
        return 4  # Throat

    if t and i and m and not r and not p:
        return 5  # Third Eye

    if not t and not i and not m and not r and p:
        return 6  # Crown

    return None


def wrap_text(text, max_chars=60):
    words = text.split()
    lines = []
    line = ""
    for w in words:
        if len(line) + len(w) + 1 <= max_chars:
            line += (" " if line else "") + w
        else:
            lines.append(line)
            line = w
    if line:
        lines.append(line)
    return lines


def analyze_face(face_landmarks, img_w, img_h):
    if not face_landmarks:
        return (255, 255, 255), "No face", 0.02, 0.02

    lm = face_landmarks.landmark
    upper_lip = lm[13]
    lower_lip = lm[14]
    left_eye_top = lm[159]
    left_eye_bottom = lm[145]

    def dist(a, b):
        return math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)

    mouth_open = dist(upper_lip, lower_lip)
    eye_open = dist(left_eye_top, left_eye_bottom)

    if mouth_open > 0.035:
        aura_color = (0, 255, 255)
        mood = "Expressive / Happy"
    elif eye_open < EYE_CLOSED_THRESHOLD:
        aura_color = (255, 128, 0)
        mood = "Calm / Meditative"
    else:
        aura_color = (255, 255, 255)
        mood = "Neutral"

    return aura_color, mood, eye_open, mouth_open


class BreathingTracker:
    def __init__(self, smoothing=0.9):
        self.prev_y = None
        self.smoothed = 0.0
        self.smoothing = smoothing
        self.last_time = time.time()
        self.breath_phase = 0.0

    def update(self, nose_y):
        if self.prev_y is None:
            self.prev_y = nose_y
            return
        dy = nose_y - self.prev_y
        self.prev_y = nose_y
        self.smoothed = self.smoothing * self.smoothed + (1 - self.smoothing) * dy
        dt = max(1e-3, time.time() - self.last_time)
        self.last_time = time.time()
        self.breath_phase += self.smoothed * 50
        if self.breath_phase > 2 * math.pi:
            self.breath_phase -= 2 * math.pi
        if self.breath_phase < 0:
            self.breath_phase += 2 * math.pi

    def get_breath_factor(self):
        return 1.0 + 0.3 * math.sin(self.breath_phase)


def draw_universe(frame, t):
    h, w, _ = frame.shape
    cx = int(w * 0.82)
    cy = int(h * 0.5)

    overlay = frame.copy()
    cv2.circle(overlay, (cx, cy), 140, (40, 0, 60), -1)
    cv2.circle(overlay, (cx, cy), 90, (80, 0, 120), -1)
    cv2.addWeighted(overlay, 0.25, frame, 0.75, 0, frame)

    cv2.circle(frame, (cx, cy), 26, (0, 255, 255), -1)

    orbit_radii = [55, 90, 125]
    speeds = [0.9, 0.6, 0.35]
    colors = [(255, 200, 0), (255, 255, 255), (0, 215, 255)]

    for r, spd, col in zip(orbit_radii, speeds, colors):
        angle = t * spd
        px = int(cx + r * math.cos(angle))
        py = int(cy + r * math.sin(angle))
        cv2.circle(frame, (px, py), 10, col, -1)
        cv2.ellipse(frame, (cx, cy), (r, r), 0, 0, 360, (90, 90, 120), 1)


def draw_chakras(frame, center_x, top_y, bottom_y,
                 active_index, energies, aura_color,
                 breath_factor, t):
    num_chakras = 7
    ys = np.linspace(bottom_y, top_y, num_chakras)

    music_pulse = 0.8 + 0.35 * math.sin(2.0 * t)

    for i in range(num_chakras):
        chakra_name = CHAKRA_NAMES[i]
        base_color = CHAKRA_COLORS[i]
        energy = energies[i]

        wobble = 8 * math.sin(t * 1.4 + i * 0.9)
        cy = int(ys[i] + wobble)

        base_radius = 18 + int(energy * 22)
        radius = int(base_radius * breath_factor * music_pulse)

        center = (center_x, cy)

        aura_radius = int(radius * (1.5 + 0.3 * music_pulse))
        aura_alpha = min(0.9, 0.25 + 0.5 * energy * music_pulse)

        overlay = frame.copy()
        cv2.circle(overlay, center, aura_radius, aura_color, -1)
        cv2.addWeighted(overlay, aura_alpha, frame, 1 - aura_alpha, 0, frame)

        cv2.circle(frame, center, radius, base_color, -1)

        orbit_r = int(radius * 1.6)
        dot_angle = t * 2.5 + i
        dot_x = int(center[0] + orbit_r * math.cos(dot_angle))
        dot_y = int(center[1] + orbit_r * math.sin(dot_angle))
        cv2.circle(frame, (dot_x, dot_y), 4, (255, 255, 255), -1)

        if i == active_index:
            cv2.circle(frame, center, radius + 6, (255, 255, 255), 2)

        cv2.putText(frame, chakra_name, (center[0] + 30, center[1] + 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1, cv2.LINE_AA)


def draw_chakra_meter(frame, energies):
    bar_w = 20
    bar_h = 90
    gap = 8
    x0 = 40
    y0 = 60
    for i, energy in enumerate(energies):
        y_top = y0 + i * (bar_h + gap)
        color = CHAKRA_COLORS[i]
        cv2.rectangle(frame, (x0, y_top), (x0 + bar_w, y_top + bar_h),
                      (60, 60, 60), 1)
        filled_h = int(bar_h * energy)
        y_fill = y_top + (bar_h - filled_h)
        cv2.rectangle(frame, (x0, y_fill), (x0 + bar_w, y_top + bar_h),
                      color, -1)
        cv2.putText(frame, f"{int(energy * 100)}%", (x0 + 30, y_top + 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (220, 220, 220), 1, cv2.LINE_AA)
        cv2.putText(frame, CHAKRA_NAMES[i].split()[0], (x0 + 30, y_top + 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (200, 200, 200), 1, cv2.LINE_AA)


def generate_smart_coach_message(energies, mood_label, alignment_mode, gyan_active):
    if gyan_active:
        return "Gyan Mudra detected — Deep Meditation Mode."
    weakest_idx = int(np.argmin(energies))
    strongest_idx = int(np.argmax(energies))
    weakest_name = CHAKRA_NAMES[weakest_idx]
    strongest_name = CHAKRA_NAMES[strongest_idx]
    if alignment_mode:
        return "✨ Alignment Mode: All chakras are being gently balanced..."
    if energies[weakest_idx] < 0.3:
        return f"Tip: {weakest_name} is low. Try its gesture to recharge. ({mood_label})"
    if all(e > 0.7 for e in energies):
        return f"Beautiful! Your energy looks balanced. Stay with your breath. ({mood_label})"
    return f"Focus on breath. {strongest_name} is strong, {weakest_name} needs love. ({mood_label})"


def draw_gyan_sparkles(frame, center_x, center_y, radius):
    overlay = frame.copy()
    for _ in range(35):
        angle = random.uniform(0, 2 * math.pi)
        r = random.uniform(radius * 0.6, radius * 1.1)
        x = int(center_x + r * math.cos(angle))
        y = int(center_y + r * math.sin(angle))
        cv2.circle(overlay, (x, y), random.randint(2, 4), (0, 215, 255), -1)
    cv2.addWeighted(overlay, 0.8, frame, 0.2, 0, frame)


class PostureAnalyzer:
    def __init__(self):
        self.last_label = "Unknown"

    def assess(self, pose_landmarks):
        if not pose_landmarks:
            self.last_label = "No body"
            return 0.0, self.last_label

        lm = pose_landmarks.landmark
        ls, rs = lm[11], lm[12]
        lh, rh = lm[23], lm[24]

        mid_shoulders = ((ls.x + rs.x) * 0.5, (ls.y + rs.y) * 0.5)
        mid_hips = ((lh.x + rh.x) * 0.5, (lh.y + rh.y) * 0.5)

        dx = mid_shoulders[0] - mid_hips[0]
        dy = mid_shoulders[1] - mid_hips[1] + 1e-6
        spine_angle = abs(math.degrees(math.atan2(dx, dy)))  # 0 is vertical

        shoulder_level = abs(ls.y - rs.y)
        hips_level = abs(lh.y - rh.y)

        score = 1.0
        if spine_angle > 10:
            score -= min(0.5, (spine_angle - 10) / 40)
        if shoulder_level > 0.03:
            score -= min(0.3, (shoulder_level - 0.03) / 0.1)
        if hips_level > 0.03:
            score -= min(0.2, (hips_level - 0.03) / 0.1)

        score = max(0.0, min(1.0, score))
        if score > 0.8:
            label = "Aligned"
        elif score > 0.6:
            label = "Slight tilt"
        elif score > 0.4:
            label = "Adjust spine/shoulders"
        else:
            label = "Poor posture"
        self.last_label = label
        return score, label


def draw_smart_tracking(frame, hand_results, face_results, yoga_mode=False):
    """
    Draws 'smart' tracking overlays:
    - 21 hand points with connections
    - Face mesh (contours)
    - Dynamic style based on yoga_mode
    """
    if not yoga_mode:
        # Subtle mode
        hand_style = mp_drawing.DrawingSpec(color=(0, 255, 255), thickness=1, circle_radius=1)
        face_style = mp_drawing.DrawingSpec(color=(255, 255, 255), thickness=1, circle_radius=1)
        conn_style = mp_drawing.DrawingSpec(color=(255, 255, 255), thickness=1)
    else:
        # "Extra Smart" Yoga Mode - Glowing/High-tech look
        hand_style = mp_drawing.DrawingSpec(color=(0, 255, 0), thickness=2, circle_radius=3)
        face_style = mp_drawing.DrawingSpec(color=(0, 255, 255), thickness=1, circle_radius=1)
        conn_style = mp_drawing.DrawingSpec(color=(50, 205, 50), thickness=2)

    # Draw Hands
    if hand_results.multi_hand_landmarks:
        for hand_landmarks in hand_results.multi_hand_landmarks:
            mp_drawing.draw_landmarks(
                frame,
                hand_landmarks,
                mp_hands.HAND_CONNECTIONS,
                hand_style,
                conn_style
            )

    # Draw Face Mesh
    if face_results.multi_face_landmarks:
        for face_landmarks in face_results.multi_face_landmarks:
            mp_drawing.draw_landmarks(
                frame,
                face_landmarks,
                mp_face.FACEMESH_TESSELATION,
                landmark_drawing_spec=None,
                connection_drawing_spec=mp_drawing.DrawingSpec(color=(100, 100, 100), thickness=1, circle_radius=1)
            )
            mp_drawing.draw_landmarks(
                frame,
                face_landmarks,
                mp_face.FACEMESH_CONTOURS,
                landmark_drawing_spec=None,
                connection_drawing_spec=face_style
            )

def detect_namaste(hand_results):
    """
    Detects if two hands are present and close together (Namaste gesture).
    Note: mp_hands with max_num_hands=1 won't work for this.
    We need to update max_num_hands to 2 in the main setup.
    """
    if not hand_results.multi_hand_landmarks or len(hand_results.multi_hand_landmarks) < 2:
        return False
    
    # Simple check: distance between wrist points
    h1 = hand_results.multi_hand_landmarks[0].landmark[0]
    h2 = hand_results.multi_hand_landmarks[1].landmark[0]
    
    dist = math.sqrt((h1.x - h2.x)**2 + (h1.y - h2.y)**2)
    return dist < 0.15  # Threshold for hands being close


class AnalyticsTracker:
    def __init__(self):
        self.mudra_counts = {"Gyan": 0, "Fist": 0, "OpenPalm": 0, "Peace": 0}
        self.posture_alerts = 0
        self.posture_samples = []
        self.chakra_time = [0.0] * 7
        self.last_chakra_idx = None
        self.last_chakra_time = time.time()

    def record_chakra(self, idx):
        now = time.time()
        if self.last_chakra_idx is not None:
            self.chakra_time[self.last_chakra_idx] += now - self.last_chakra_time
        self.last_chakra_idx = idx
        self.last_chakra_time = now

    def record_mudra(self, name):
        if name in self.mudra_counts:
            self.mudra_counts[name] += 1

    def record_posture(self, score):
        self.posture_samples.append(score)
        if score < 0.5:
            self.posture_alerts += 1

    def summary(self):
        avg_posture = sum(self.posture_samples) / len(self.posture_samples) if self.posture_samples else 0.0
        return {
            "chakra_time": self.chakra_time,
            "mudras": self.mudra_counts,
            "posture_alerts": self.posture_alerts,
            "avg_posture": avg_posture,
        }


class MeditationTracker:
    def __init__(self):
        self.stage = "Dharana (Concentration)"
        self.concentration_level = 0.0
        self.start_time = 0
        self.in_dhyana = False
        
    def update(self, eye_open, breath_stable, body_still):
        # Logic: Eyes closed + stable breath = Dhyana
        if eye_open < 0.018: # Eyes closed
            if not self.in_dhyana:
                self.in_dhyana = True
                self.start_time = time.time()
                self.stage = "Dhyana (Meditation)"
            
            # Increase concentration over time
            duration = time.time() - self.start_time
            self.concentration_level = min(100.0, duration * 2.5) # Max in ~40s
            
            if duration > 30 and breath_stable:
                self.stage = "Samadhi (Absorption)"
        else:
            self.in_dhyana = False
            self.concentration_level = max(0.0, self.concentration_level - 2.0)
            self.stage = "Dharana (Concentration)"
            
        return self.stage, self.concentration_level

# 🔊 Bilingual (Hindi + English) voice summary
def speak_summary(chakra_energies, total_gyan_count, alignment_count, duration_min):
    strongest_idx = int(np.argmax(chakra_energies))
    weakest_idx = int(np.argmin(chakra_energies))

    strongest = CHAKRA_NAMES[strongest_idx]
    weakest = CHAKRA_NAMES[weakest_idx]

    msg = (
        f"Namaste Aditya. Aapka Yoga session ka chhota sa summary ready hai. "
        f"Total session time approximately {duration_min:.1f} minutes raha. "
        f"Is dauraan sabse zyaada active aur powerful chakra tha {strongest}. "
        f"Jo chakra thoda weak side par tha, woh tha {weakest}. "
        f"Aapne Gyaan Mudra total {total_gyan_count} baar kiya. "
        f"Alignment Mode {alignment_count} times activate hua, jab aapki saanse "
        f"aur body dono ekdum shaant state mein aa gayi. "
        f"Keep breathing deeply, dil halka rakhiye, aur apni energy balanced rakhiye. "
        f"Hari Om."
    )

    tts.say(msg)
    tts.runAndWait()


def create_summary_image(chakra_energies, duration_min, total_gyan_count, alignment_count):
    img = np.zeros((600, 800, 3), dtype=np.uint8)
    img[:] = (15, 15, 15)
    cv2.putText(img, "AI ChakraFlow Summary", (170, 60),
                cv2.FONT_HERSHEY_SIMPLEX, 1.2, (255, 255, 255), 3)
    y = 150
    for i, energy in enumerate(chakra_energies):
        cv2.putText(img, f"{CHAKRA_NAMES[i]}: {int(energy*100)}%",
                    (80, y), cv2.FONT_HERSHEY_SIMPLEX, 0.8, CHAKRA_COLORS[i], 2)
        y += 45
    cv2.putText(img, f"Session Time: {duration_min:.1f} min", (80, 420),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (200, 200, 255), 2)
    cv2.putText(img, f"Gyan Mudra: {total_gyan_count}", (80, 470),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (200, 255, 200), 2)
    cv2.putText(img, f"Alignment Mode: {alignment_count}", (80, 520),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 215, 150), 2)
    cv2.imwrite("summary_output.png", img)
    return img


def show_chakra_bar_graph(chakra_energies):
    graph = np.zeros((500, 800, 3), dtype=np.uint8)
    for i, energy in enumerate(chakra_energies):
        bar_h = int(energy * 400)
        x1 = 80 + i * 100
        y1 = 450 - bar_h
        x2 = x1 + 70
        y2 = 450
        cv2.rectangle(graph, (x1, y1), (x2, y2), CHAKRA_COLORS[i], -1)
        cv2.putText(graph, CHAKRA_NAMES[i].split()[0], (x1, 470),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
    cv2.imshow("Chakra Energy Bar Graph", graph)
    cv2.imwrite("chakra_graph.png", graph)


def show_final_report(session_start, chakra_energies, total_gyan_count, alignment_count):
    end_time = time.time()
    duration_min = (end_time - session_start) / 60.0
    strongest_idx = int(np.argmax(chakra_energies))
    weakest_idx = int(np.argmin(chakra_energies))
    strongest = CHAKRA_NAMES[strongest_idx]
    weakest = CHAKRA_NAMES[weakest_idx]
    calmness_score = int((chakra_energies[3] + chakra_energies[6]) / 2 * 100)

    print("\n=========================")
    print("     FINAL YOGA REPORT")
    print("=========================\n")
    print(f"🧘 Session Duration: {duration_min:.2f} minutes")
    print(f"✨ Strongest Chakra: {strongest}")
    print(f"⚪ Weakest Chakra: {weakest}")
    print(f"\n🔱 Gyan Mudra Activations: {total_gyan_count} times")
    print(f"🟣 Alignment Mode Entered: {alignment_count} times")
    print("\n📊 Final Chakra Energy Levels:")
    for i, energy in enumerate(chakra_energies):
        print(f"   {CHAKRA_NAMES[i]}: {int(energy*100)}%")
    print(f"\n🌬️ Breath Calmness Score: {calmness_score}/100")
    print("\n🙏 Thank you for practicing with AI ChakraFlow.")
    print("   Keep breathing. Stay mindful. Namaste.\n")


# ======================== MAIN ===========================

def main():
    cap = cv2.VideoCapture(CAM_INDEX)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT)
    if not cap.isOpened():
        print("[ERROR] Could not open camera.")
        return

    # Background music
    if os.path.exists(MUSIC_PATH):
        try:
            pygame.mixer.music.load(MUSIC_PATH)
            pygame.mixer.music.set_volume(0.8)
            pygame.mixer.music.play(-1)
            print("[INFO] Playing background music: Adiyogi")
        except Exception as e:
            print("[WARN] Could not play background music:", e)
    else:
        print("[WARN] Music file not found:", MUSIC_PATH)

    hands = mp_hands.Hands(
        max_num_hands=2,
        min_detection_confidence=0.7, # Increased for better detection
        min_tracking_confidence=0.7
    )
    face_mesh = mp_face.FaceMesh(
        max_num_faces=1,
        refine_landmarks=False,  # turn off iris refinement to save CPU
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    )
    pose = mp_pose.Pose(
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
        model_complexity=0  # lightweight model to reduce lag
    )

    chakra_energies = [0.4] * 7
    last_chakra_index = None
    last_activation_time = time.time()
    breathing = BreathingTracker()

    session_start = time.time()
    eye_closed_frames = 0
    alignment_mode = False
    alignment_start_time = 0.0
    alignment_progress = 0.0
    gyan_active = False
    total_gyan_count = 0
    alignment_count = 0
    alignment_count = 0
    last_gyan_state = False
    
    # Smart Yoga Mode State
    yoga_mode_active = False
    namaste_hold_start = 0
    namaste_triggered = False
    
    # Awakening Sequence State
    was_eyes_closed = False
    eyes_closed_start = 0
    awakening_active = False
    awakening_start = 0

    # AI explainer state
    ai_text = "Breathe easy. Hold a gesture to get a short tip."
    last_ai_chakra = None
    last_ai_time = 0

    posture_analyzer = PostureAnalyzer()
    analytics = AnalyticsTracker()
    meditation_tracker = MeditationTracker()

    # Voice recognizer (heavy) can be disabled if laggy
    ENABLE_VOICE = False
    if ENABLE_VOICE:
        r = sr.Recognizer()
        mic = sr.Microphone()
    last_voice_check = 0

    # Frame throttling for pose to reduce lag
    pose_every_n = 2
    frame_count = 0
    last_pose_landmarks = None

    print("[INFO] AI ChakraFlow FULL started. Press 'q' to quit.")

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frame = cv2.flip(frame, 1)
        h, w, _ = frame.shape
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        hand_res = hands.process(rgb)
        face_res = face_mesh.process(rgb)
        frame_count += 1
        if frame_count % pose_every_n == 0:
            pose_res = pose.process(rgb)
            last_pose_landmarks = pose_res.pose_landmarks if pose_res else None
        else:
            pose_res = None

        center_x = w // 2
        top_y = int(h * 0.25)
        bottom_y = int(h * 0.85)

        active_chakra_idx = None
        aura_color = (255, 255, 255)
        mood_label = "..."
        posture_score = 0.0
        posture_label = "No body"

        if face_res.multi_face_landmarks:
            face_landmarks = face_res.multi_face_landmarks[0]
            aura_color, mood_label, eye_open, mouth_open = analyze_face(face_landmarks, w, h)
            nose = face_landmarks.landmark[1]
            nose_y = nose.y
            breathing.update(nose_y)
            center_x = int(nose.x * w)

            # --- Awakening Trigger Logic ---
            is_eyes_closed = (eye_open < EYE_CLOSED_THRESHOLD)
            
            # Debug Eye Value (Temporary, for tuning)
            # draw_text_with_bg(frame, f"Eye: {eye_open:.4f} (Thresh: {EYE_CLOSED_THRESHOLD})", 30, h - 120, color=(200, 200, 200))
            
            if is_eyes_closed:
                if not was_eyes_closed:
                    eyes_closed_start = time.time()
                was_eyes_closed = True
                eye_closed_frames += 1
                # Visual Feedback for Eyes Closed
                try:
                    draw_text_with_bg(frame, "Meditation Detector: Eyes Closed", center_x - 120, center_y - 50, color=(255, 255, 0))
                except Exception as e:
                    print(f"[ERROR] Could not draw meditation text: {e}")
            else:
                # Eyes just opened
                if was_eyes_closed:
                    duration_closed = time.time() - eyes_closed_start
                    if duration_closed > 4.0: # Meditated for at least 4 sec
                        awakening_active = True
                        awakening_start = time.time()
                        print("[INFO] Chakra Awakening Sequence Started!")
                was_eyes_closed = False
                eye_closed_frames = 0
            # -------------------------------

            if eye_closed_frames > EYE_CLOSED_FRAMES_REQUIRED and not alignment_mode:
                alignment_mode = True
                alignment_count += 1
                alignment_start_time = time.time()
                alignment_progress = 0.0
                print("[INFO] Alignment Mode activated.")
        else:
            breathing.update(0.5)
            eye_closed_frames = 0
            was_eyes_closed = False

        # POSE (throttled)
        pose_landmarks = pose_res.pose_landmarks if pose_res and pose_res.pose_landmarks else last_pose_landmarks
        if pose_landmarks:
            posture_score, posture_label = posture_analyzer.assess(pose_landmarks)
            analytics.record_posture(posture_score)
        else:
            posture_score, posture_label = 0.0, "No body"

        breath_factor = breathing.get_breath_factor()

        # HANDS
        gyan_active = False
        if hand_res.multi_hand_landmarks and not alignment_mode:
            hand_landmarks = hand_res.multi_hand_landmarks[0]
            finger_states = get_finger_states(hand_landmarks, w, h)
            
            # Pass frame for debug drawing
            gyan_active = detect_gyan_mudra(hand_landmarks, frame, w, h)
            
            if gyan_active and not last_gyan_state:
                analytics.record_mudra("Gyan")
            if detect_fist(finger_states):
                analytics.record_mudra("Fist")
            if detect_open_palm(finger_states):
                analytics.record_mudra("OpenPalm")
            if detect_peace(hand_landmarks):
                analytics.record_mudra("Peace")
            chakra_idx = classify_chakra_gesture(finger_states, gyan=gyan_active)
            if gyan_active and not last_gyan_state:
                total_gyan_count += 1
            last_gyan_state = gyan_active

            if chakra_idx is not None:
                active_chakra_idx = chakra_idx
                last_activation_time = time.time()
                for i in range(len(chakra_energies)):
                    if i == chakra_idx:
                        chakra_energies[i] = min(1.0, chakra_energies[i] + 0.02)
                    else:
                        chakra_energies[i] = max(0.1, chakra_energies[i] - 0.004)
                analytics.record_chakra(chakra_idx)
                if chakra_idx != last_chakra_index:
                    print(f"[INFO] Activated chakra: {CHAKRA_NAMES[chakra_idx]}")
                    last_chakra_index = chakra_idx
                    # Trigger AI explainer when chakra changes (small, safe prompt)
                    now_ai = time.time()
                    if now_ai - last_ai_time > 3:
                        entry = CHAKRA_SCRIPTURES[chakra_idx]
                        # Pass meditation context to AI
                        ai_text = ai_explainer.get_ai_explanation(
                            entry,
                            {"pose": None, "chakra": CHAKRA_NAMES[chakra_idx]},
                            {"mudra": "Gyan" if gyan_active else "Gesture"},
                            {"smoothness": 0.5, "rate": 0.0, "pranayama_count": 0},
                            {"user_level": "home", "tone": "calm", "meditation_stage": meditation_tracker.stage},
                            enable_api=True
                        )
                        last_ai_chakra = chakra_idx
                        last_ai_time = now_ai
        else:
            for i in range(len(chakra_energies)):
                chakra_energies[i] = max(0.1, chakra_energies[i] - 0.002)

        # Periodic AI refresh (also works when same chakra stays active)
        target_chakra = active_chakra_idx if active_chakra_idx is not None else int(np.argmax(chakra_energies))
        now_ai = time.time()
        if now_ai - last_ai_time > AI_REFRESH_SECS or target_chakra != last_ai_chakra:
            entry = CHAKRA_SCRIPTURES[target_chakra]
            # Disable API calls to avoid network stalls; fall back to static meaning text
            ai_text = f"{entry['hinglish']}: {entry['meaning']}"
            last_ai_chakra = target_chakra
            last_ai_time = now_ai

        # ALIGNMENT
        if alignment_mode:
            alignment_progress = min(1.0, alignment_progress + 0.01)
            for i in range(len(chakra_energies)):
                chakra_energies[i] = chakra_energies[i] * (1 - alignment_progress) + 0.9 * alignment_progress
            aura_color = (0, 215, 255)
            if time.time() - alignment_start_time > 8:
                alignment_mode = False
                print("[INFO] Alignment Mode ended.")

        # BACKGROUND AURA
        current_t = time.time() - session_start
        center_y = int(h * 0.55)
        aura_radius = int(min(w, h) * 0.4)
        if gyan_active and not alignment_mode:
            aura_color = (255, 255, 255)

        overlay_bg = frame.copy()
        cv2.circle(overlay_bg, (center_x, center_y), aura_radius, aura_color, -1)
        cv2.addWeighted(overlay_bg, 0.15, frame, 0.85, 0, frame)
        if gyan_active and not alignment_mode:
            draw_gyan_sparkles(frame, center_x, center_y, aura_radius)

        # CHAKRAS, METER, UNIVERSE
        if awakening_active:
            # Awakening Animation - Slower & Cumulative
            # User requested "after 5 sec", so we slow it down significantly.
            step_duration = 4.0 
            total_duration = 7 * step_duration
            
            anim_t = time.time() - awakening_start
            if anim_t > total_duration + 2.0: # +2s buffer at end
                awakening_active = False
            else:
                active_idx = int(anim_t / step_duration)
                if active_idx < 7:
                    # Cumulative: Keep all lower chakras lit
                    for i in range(active_idx + 1):
                        chakra_energies[i] = 1.0
                    
                    # Visual flare for the *current* new one
                    current_chakra = CHAKRA_NAMES[active_idx]
                    draw_text_with_bg(frame, f"RISING: {current_chakra.upper()}", 
                                    center_x - 120, center_y - 120, 
                                    font_scale=1.2, color=CHAKRA_COLORS[active_idx], bg_alpha=0.7)
        
        if not yoga_mode_active:
            draw_chakras(frame, center_x, top_y, bottom_y,
                        active_chakra_idx if active_chakra_idx is not None else -1,
                        chakra_energies, aura_color, breath_factor, current_t)
            draw_chakra_meter(frame, chakra_energies)
            draw_universe(frame, current_t)
        else:
            # Yoga Mode UI
            # Draw Chakras (so they are visible during Awakening/Meditation)
            draw_chakras(frame, center_x, top_y, bottom_y,
                        active_chakra_idx if active_chakra_idx is not None else -1,
                        chakra_energies, aura_color, breath_factor, current_t)
            
            draw_text_with_bg(frame, "YOGA MODE ACTIVE", int(w*0.05), int(h*0.1), font_scale=1, color=(0, 255, 0))
            
            # Show more technical stats
            draw_text_with_bg(frame, f"Breath Phase: {breathing.breath_phase:.2f}", int(w*0.05), int(h*0.15), color=(200, 255, 200))
            draw_text_with_bg(frame, f"Posture: {posture_label} ({posture_score:.2f})", int(w*0.05), int(h*0.19), color=(200, 255, 200))
            
            # Meditation Stats
            med_stage, med_level = meditation_tracker.update(eye_open, True, posture_score > 0.6)
            
            stage_color = (255, 200, 100)
            if "Dhyana" in med_stage: stage_color = (100, 255, 255)
            if "Samadhi" in med_stage: stage_color = (255, 100, 255)
            
            draw_text_with_bg(frame, f"Stage: {med_stage}", int(w*0.05), int(h*0.23), font_scale=0.7, color=stage_color)
            draw_text_with_bg(frame, f"Concentration: {med_level:.1f}%", int(w*0.05), int(h*0.27))
            
            # If in Dhyana/Samadhi, boost all chakras
            if "Dhyana" in med_stage or "Samadhi" in med_stage:
                 for i in range(len(chakra_energies)):
                    chakra_energies[i] = min(1.0, chakra_energies[i] + 0.005)

        # Draw Smart Tracking
        draw_smart_tracking(frame, hand_res, face_res, yoga_mode=yoga_mode_active)

        # Namaste Detection for Mode Toggle
        if detect_namaste(hand_res):
            if namaste_hold_start == 0:
                namaste_hold_start = time.time()
            elif time.time() - namaste_hold_start > 2.0: # Hold for 2 seconds
                if not namaste_triggered:
                    yoga_mode_active = not yoga_mode_active
                    namaste_triggered = True
                    print(f"[INFO] Yoga Mode {'Activated' if yoga_mode_active else 'Deactivated'}")
                    cv2.putText(frame, "Mode Switched!", (center_x - 100, center_y), 
                               cv2.FONT_HERSHEY_SIMPLEX, 1.5, (255, 255, 0), 3)
        else:
            namaste_hold_start = 0
            namaste_triggered = False

        # COACH TEXT
        coach_msg = generate_smart_coach_message(chakra_energies, mood_label, alignment_mode, gyan_active)
        draw_text_with_bg(frame, coach_msg, 30, h - 50, bg_alpha=0.5)

        if gyan_active and not alignment_mode:
            draw_text_with_bg(frame, "Gyan Mudra — Crown Chakra Awakening", int(w * 0.18), int(h * 0.12), font_scale=0.8)

        idle_time = time.time() - last_activation_time
        if idle_time > 10 and not alignment_mode and not gyan_active:
            draw_text_with_bg(frame, "Hint: Fist (Root), open palm (Solar) or Gyan Mudra for Crown.", 30, h - 20)
        else:
            draw_text_with_bg(frame, "Press 'q' to quit", 30, h - 20)


        elapsed_min = (time.time() - session_start) / 60.0
        top_text = f"AI ChakraFlow  |  Session: {elapsed_min:.1f} min  |  Mood: {mood_label}  |  Posture: {posture_label}"
        draw_text_with_bg(frame, top_text, 30, 30, font_scale=0.7, thickness=2)

        cv2.imshow("AI ChakraFlow — Full Experience", frame)

        # Voice trigger disabled to avoid lag; set ENABLE_VOICE=True to re-enable.
        if False:
            if time.time() - last_voice_check > 4:
                last_voice_check = time.time()
                try:
                    with mic as source:
                        r.adjust_for_ambient_noise(source, duration=0.2)
                        audio = r.listen(source, timeout=0.6, phrase_time_limit=1.2)
                    try:
                        cmd = r.recognize_google(audio, language="hi-IN").lower()
                        if "hari om" in cmd or ("hari" in cmd and "om" in cmd):
                            duration_min_now = (time.time() - session_start) / 60.0
                            show_chakra_bar_graph(chakra_energies)
                            summary_img = create_summary_image(chakra_energies, duration_min_now,
                                                               total_gyan_count, alignment_count)
                            cv2.imshow("Summary Image", summary_img)
                            speak_summary(chakra_energies, total_gyan_count,
                                          alignment_count, duration_min_now)
                    except Exception:
                        pass
                except Exception:
                    pass

        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()
    pygame.mixer.quit()

    show_final_report(session_start, chakra_energies, total_gyan_count, alignment_count)
    summary = analytics.summary()
    print("\n--- Analytics ---")
    print("Mudra counts:", summary["mudras"])
    print("Avg posture score:", f"{summary['avg_posture']:.2f}")
    print("Posture alerts (score<0.5):", summary["posture_alerts"])
    print("Time per chakra (s):", [round(t, 1) for t in summary["chakra_time"]])
    print("[INFO] Exited cleanly.")


if __name__ == "__main__":
    main()
