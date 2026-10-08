# Cloude 🌍

### Find your center in a changing world.

Cloude is a technology-driven project exploring the relationship between environmental conditions, climate awareness, and climate anxiety.

The project was created to explore how technology can make environmental information more understandable, relevant, and accessible to individuals experiencing uncertainty around environmental change.

> **Powered by Anxothotl**

---

## 🌐 Live Website

**Cloude Landing Page:**  
https://cloude-anxo.vercel.app/

The landing page serves as the public-facing entry point to the Cloude experience.

---

# 🌱 About Cloude

Climate and environmental change can affect people not only through physical changes in their surroundings, but also through the way they think and feel about the future.

One of the observations that led to Cloude was that people may experience environmental or climate-related anxiety without necessarily having the awareness or information to understand what they are experiencing.

We wanted to explore a simple question:

> **Can technology help people better understand the environmental conditions around them and their relationship with those conditions?**

Cloude is our attempt to explore that question.

The project combines a user-friendly web experience with environmental information to create a more accessible way of interacting with environmental conditions.

Rather than presenting environmental data as isolated numbers, the broader Cloude project aims to provide users with information that is relevant to their surroundings and easier to interpret.

---

# 🎯 The Problem We Identified

Environmental information is widely available, but it is often presented through technical dashboards, raw measurements, or generalized forecasts.

At the same time, climate anxiety and environmental uncertainty are becoming increasingly relevant topics among young people.

This creates a gap between:

**Environmental Data**

and

**Personal Understanding**

Cloude was created to explore this gap.

Our goal is to make environmental information more contextual and approachable while encouraging users to become more aware of the conditions around them.

---

# 💡 Our Approach

The broader Cloude project explores environmental signals around a user and combines current environmental information with historical context.

The idea is to help users understand:

- What environmental conditions exist around them
- How those conditions compare with historical information
- Which environmental signals may be relevant to them
- How environmental awareness can be made more accessible
- How technology can support better understanding of climate-related concerns

The environmental analysis itself is part of the **main Cloude application**, which is maintained separately from this repository.

---

# 🖥️ This Repository

This repository contains the **public-facing entry experience of Cloude**.

It is the first part of the user's journey before entering the main application.

The repository includes:

- Landing page
- User interface
- Sign-in experience
- Page routing
- Animations and interactions
- Responsive design
- Connection to the main application
- Deployment
- Front-end implementation

The complete implementation of this repository was developed by me.

---

# 🔄 Project Flow

The overall structure of Cloude can be represented as:

```text
                    ┌──────────────────────┐
                    │    Cloude Website    │
                    │    Landing Page      │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │      Sign In         │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │  Main Cloude App     │
                    │  Separate Repository │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Environmental Data   │
                    │ & Analysis Experience│
                    └──────────────────────┘
