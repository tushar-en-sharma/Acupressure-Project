# HAND LANDMARK DETECTION FOR ACUPRESSURE POINT IDENTIFICATION USING COMPUTER VISION

## (College Submission Draft)

---

## Title Page (Use College Format)

Project Title: Hand Landmark Detection for Acupressure Point Identification Using Computer Vision  
Submitted by: [Your Name]  
Roll No.: [Your Roll Number]  
Program: [B.Tech/M.Tech/Other]  
Department: [Department Name]  
Institute: [Institute Name]  
Academic Year: [2025-26 / 2026-27]

Guide Name: [Guide Name]  
Co-Guide (if any): [Co-Guide Name]

---

## Certificate (Template)

This is to certify that the project report titled “Hand Landmark Detection for Acupressure Point Identification Using Computer Vision” submitted by [Student Name], [Roll Number], in partial fulfillment of the requirements for the degree of [Degree Name] in [Department Name], [Institute Name], is a bona fide record of work carried out under my supervision during the academic year [Year].

Guide Signature: ____________________  
Name: ____________________  
Designation: ____________________  
Date: ____________________

Head of Department Signature: ____________________  
Name: ____________________  
Date: ____________________

---

## Declaration (Template)

I hereby declare that the work presented in this project report titled “Hand Landmark Detection for Acupressure Point Identification Using Computer Vision” is an original work carried out by me under the guidance of [Guide Name], and has not been submitted in part or full for any degree or diploma to any other institution.

Student Signature: ____________________  
Name: ____________________  
Roll No.: ____________________  
Date: ____________________

---

## Acknowledgement

I express my sincere gratitude to my project guide, [Guide Name], for constant support, technical guidance, and motivation throughout the development of this project. Their suggestions were crucial in improving the design, implementation, and evaluation phases of this work.

I also thank the faculty members of [Department Name], [Institute Name], for providing the academic environment and resources needed for successful completion of this project. I am grateful to my friends and batchmates for constructive feedback during testing and demonstration phases.

Finally, I would like to thank my family for their encouragement and support throughout this journey.

---

## Abstract

Acupressure is a non-invasive therapeutic practice that requires precise localization of pressure points on the hand. Traditional point identification depends on practitioner skill and static reference charts, which are difficult for non-expert users to apply accurately in real-time. This project proposes a computer vision based system for real-time hand landmark detection and acupressure point identification.

The system begins with base hand landmark extraction and extends these points through a geometric model to generate additional palm-centric landmarks required for acupressure mapping. The runtime pipeline currently operates with a 64-point representation: 21 base landmarks, 30 geometry-model points, and 13 additional palm/acupressure support points. Orientation logic (palm/back) and side-aware mapping are used to selectively display clinically relevant points. The interface intentionally avoids visual clutter by showing only active acupressure points with clean marker overlays and labels.

A dedicated evaluation pipeline was built and executed on available hybrid ground-truth data (points 0–50). The model achieved an overall MAE of 0.02079 (normalized), RMSE of 0.04149 (normalized), PCK@2% of 62.9%, PCK@5% of 89.2%, and PCK@10% of 97.5%, while maintaining approximately 55 FPS real-time performance. Detection rate on the test set was 100%. For runtime-added points (51–63), validity statistics were reported because corresponding ground truth is currently unavailable.

The project demonstrates that combining hand landmark detection, geometric point generation, and orientation-aware acupressure mapping can produce a practical and scalable simulation tool for guided self-care and educational use.

Keywords: Computer Vision, Hand Landmarks, Acupressure, Real-Time Detection, Geometric Modeling, PCK, MAE, RMSE.

---

## Table of Contents (Suggested)

1. Introduction  
2. Problem Statement and Objectives  
3. Literature Review  
4. Proposed System and Methodology  
5. System Architecture and Implementation  
6. Experimental Setup and Evaluation Metrics  
7. Results and Analysis  
8. Conclusion  
9. Future Work  
10. References  
11. Appendix

---

## List of Figures (Suggested)

Figure 1: Overall system pipeline  
Figure 2: 21 base hand landmarks  
Figure 3: Extended landmark model (64 points)  
Figure 4: Palm/back orientation logic  
Figure 5: Acupressure point rendering output  
Figure 6: Frontend simulation display (if included)  
Figure 7: Per-point error visualization  
Figure 8: Performance summary chart

---

## List of Tables (Suggested)

Table 1: Existing methods comparison  
Table 2: System configuration and dependencies  
Table 3: Landmark index mapping summary  
Table 4: Dataset split and ground-truth coverage  
Table 5: Overall evaluation metrics  
Table 6: Best and worst per-point errors  
Table 7: Extra-point validity summary

---

## 1. Introduction

Acupressure requires correct anatomical targeting; small spatial deviations can reduce therapeutic effectiveness. Conventional training relies on static diagrams and practitioner experience, which limits accessibility for general users. Recent progress in computer vision enables robust hand pose detection from monocular RGB cameras, creating an opportunity to deliver live guided acupressure support.

However, standard hand detectors are not directly optimized for therapeutic point localization. They provide a fixed set of keypoints meant for gesture or interaction tasks, while acupressure often requires region-specific points on palm subareas and anatomically meaningful intermediate locations. To bridge this gap, this project extends standard hand landmarks with geometry-based point generation and acupressure-specific display logic.

The major idea is practical: detect reliable base landmarks, derive extra points through local geometric relationships, apply orientation-aware filtering (palm/back), and display only relevant acupressure markers in a clean interface. This avoids clutter and improves interpretability for users.

### 1.1 Motivation

- Need for easy-to-use, real-time acupressure guidance.
- Limitation of static educational charts.
- Demand for low-cost camera-based simulation tools.
- Opportunity to leverage modern hand landmark frameworks.

### 1.2 Contribution Summary

1. Built a 64-point runtime hand representation (21+30+13).  
2. Added orientation-aware acupressure activation logic.  
3. Implemented clean visualization for selected therapeutic points.  
4. Developed and executed quantitative evaluation workflow.  
5. Generated reproducible metrics artifact for reporting.

---

## 2. Problem Statement and Objectives

### 2.1 Problem Statement

How can a real-time computer vision system detect and display acupressure points on hand images with high practical accuracy, while handling orientation ambiguity and preserving visual clarity?

### 2.2 Objectives

#### General Objective
Develop a real-time simulation system for acupressure point identification using hand landmark detection and geometric modeling.

#### Specific Objectives

1. Detect base hand landmarks reliably in live and image modes.  
2. Extend the landmark set with geometry-derived points useful for acupressure mapping.  
3. Implement palm/back and side-aware filtering to avoid incorrect point display.  
4. Provide clean and precise marker visualization for readability.  
5. Evaluate accuracy and runtime performance using standard keypoint metrics.  
6. Create a report-ready metrics pipeline and artifacts.

---

## 3. Literature Review

### 3.1 Hand Landmark Detection

Hand landmark detection has evolved from handcrafted image processing to learned keypoint regression. Modern pipelines provide robust landmark localization under moderate pose variation and changing illumination. These systems are widely used in gesture recognition, sign-language interaction, and AR control.

### 3.2 Medical and Wellness Point Localization

Most wellness tools provide static acupressure charts. Real-time systems are fewer and often lack quantitative validation. This project contributes by adding measurable evaluation and dynamic orientation-aware mapping.

### 3.3 Keypoint Evaluation Metrics

For geometric keypoint systems, the most accepted metrics are:
- MAE (mean absolute keypoint error)
- RMSE (error emphasizing outliers)
- PCK at normalized thresholds
- FPS for real-time deployment

### 3.4 Research Gap

- Limited work combining dynamic hand keypoints + acupressure logic + real-time evaluation in one reproducible pipeline.  
- Sparse reporting of extra runtime points without GT.

This project addresses both.

---

## 4. Proposed System and Methodology

### 4.1 Pipeline

1. Capture RGB frame from webcam or image.  
2. Detect base landmarks (21 points).  
3. Reconstruct geometry-model points (21–50).  
4. Compute extra palm/acupressure points (51–63).  
5. Detect palm/back orientation from geometric hand vectors.  
6. Activate mapped points based on side + face constraints.  
7. Render markers, labels, and active-condition panel.

### 4.2 Geometric Reconstruction

Custom points are computed using anchor-parent bone direction and perpendicular offset ratios. This preserves consistency across hand sizes and improves spatial stability.

### 4.3 Orientation Handling

Palm/back inference is based on the sign of cross product between wrist→index and wrist→pinky vectors. This makes acupressure mapping state-aware and avoids wrong-side point display.

### 4.4 Custom Acupressure Points

Current mapped conditions include:
- Chronic Bronchitis (Lu5)  
- Sciatica Pain (BL60)  
- Back Stiffness (P59)  
- Constipation (C62)  
- Headache (H63, defined just below point 58)

---

## 5. System Architecture and Implementation

### 5.1 Core Files

- MAINCODE/run.py: runtime landmark visualization (all points).  
- MAINCODE/accupressure_points.py: condition-specific acupressure display logic.  
- MAINCODE/evaluate_model.py: full metric computation and reporting.  
- MAINCODE/models/geometry_model_51pt.pkl: learned geometry point definitions.

### 5.2 Execution Modes

- Webcam mode for live simulation.  
- Image mode for static testing and output frame export.

### 5.3 Visualization Design

- Small filled point markers for precise look.  
- Floating labels for point identities.  
- Right-side panel showing active conditions and descriptions.

---

## 6. Experimental Setup and Evaluation Metrics

### 6.1 Dataset

Ground-truth source: version4/hybrid_51_points.csv  
Total images: 50  
GT points per image: 51 (indices 0–50)

### 6.2 Metric Definitions

Let predicted point be $\hat{p}_i$, ground-truth point be $p_i$, and total evaluated points be $N$.

MAE:
$$
MAE = \frac{1}{N}\sum_{i=1}^{N} ||\hat{p}_i - p_i||
$$

RMSE:
$$
RMSE = \sqrt{\frac{1}{N}\sum_{i=1}^{N} ||\hat{p}_i - p_i||^2}
$$

PCK at threshold $t$:
$$
PCK@t = \frac{1}{N}\sum_{i=1}^{N} \mathbf{1}(||\hat{p}_i - p_i|| < t \cdot s)
$$
where $s$ is hand-size normalization factor.

### 6.3 Note on Extra Points

Points 51–63 do not currently have GT labels in the available CSV. Therefore, these points are evaluated by validity rate (in-range and produced consistently), not by GT distance metrics.

---

## 7. Results and Analysis

### 7.1 Overall Metrics (Current Run)

- Images detected: 50/50  
- Detection rate: 100.0%  
- MAE (normalized): 0.02079  
- RMSE (normalized): 0.04149  
- MAE (pixels): 29.89  
- RMSE (pixels): 55.20  
- PCK@2%: 62.9%  
- PCK@5%: 89.2%  
- PCK@10%: 97.5%  
- Inference speed: 55.0 FPS

### 7.2 Interpretation

- Real-time speed is strong for live simulation usage.  
- PCK@10 indicates high practical correctness for visual guidance.  
- Lower PCK@2 reflects strict-threshold sensitivity and local point complexity.  
- Extra points (51–63) are consistently valid in generated outputs.

### 7.3 Strengths

- Stable real-time inference.  
- Good practical localization thresholds.  
- Clear acupressure-focused rendering (not cluttered).

### 7.4 Limitations

- GT coverage ends at point 50.  
- No clinical trial/medical validation in current scope.  
- Some hard points remain sensitive under extreme pose.

---

## 8. Conclusion

This project successfully demonstrates a real-time acupressure point identification system built on hand landmark detection and geometric extension. The final runtime model supports 64 points and includes custom therapeutic point logic with orientation-aware display. The evaluation pipeline confirms accurate and fast performance for simulation use, with clear room for further GT expansion and clinical-grade validation.

---

## 9. Future Work

1. Annotate GT for points 51–63 and evaluate full 64-point accuracy.  
2. Add temporal smoothing for reduced marker jitter.  
3. Expand acupressure mapping library and condition coverage.  
4. Add confidence values per point and threshold controls.  
5. Build clinician-reviewed validation dataset.  
6. Prepare mobile-friendly deployment variant.

---

## 10. References (Starter Set)

1. Zhang, F. et al., “MediaPipe Hands: On-device Real-time Hand Tracking,” arXiv, 2020.  
2. Bradski, G., “The OpenCV Library,” Dr. Dobb’s Journal, 2000.  
3. Paszke, A. et al., “PyTorch: An Imperative Style, High-Performance Deep Learning Library,” NeurIPS, 2019.  
4. WHO, “WHO Standard Acupuncture Point Locations,” 2008.  
5. Everingham, M. et al., “The PASCAL VOC Challenge,” IJCV, 2010.

---

## 11. Appendix

### Appendix A: Commands Used

- Run simulation: python accupressure_points.py  
- Run evaluator: /Users/tusharsharma/Desktop/ISR-Code/.venv/bin/python evaluate_model.py

### Appendix B: Metrics Artifact

Primary metrics JSON: MAINCODE/metrics_64pt.json

### Appendix C: Suggested Formatting for Final Submission

- Font: Times New Roman, 12 pt  
- Line spacing: 1.5  
- Margins: 1 inch all sides  
- Header: chapter title  
- Footer: page number centered  
- Citation style: IEEE (or your college standard)

---

## Viva Quick Answers (Optional)

Q1: Why 64 points?  
A: 21 base + 30 geometric + 13 palm/acupressure support points for practical therapeutic mapping.

Q2: Why evaluate only 0–50 for accuracy?  
A: Available GT CSV labels only 0–50; extra points are runtime-generated and currently evaluated by validity.

Q3: Why PCK metric?  
A: It provides threshold-based practical correctness, useful for keypoint applications.

Q4: Is it real-time?  
A: Yes, around 55 FPS in current setup.
