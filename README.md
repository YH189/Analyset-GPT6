# AnalySet

> An experimental production-style data application built end-to-end with GPT-6 Astra to evaluate how far autonomous AI-assisted software development can go.

AnalySet is a dataset quality, profiling, validation, comparison, and statistical drift-analysis platform for analytics and machine-learning workflows.

The project was created as an experiment in AI-driven software engineering: GPT-6 Astra was used throughout the development lifecycle to design the architecture, generate the frontend and backend, implement analytical logic, write and run tests, identify and fix bugs, configure deployment, create documentation, and iterate on the live application.

## Live Demo

**Application**

https://analyset.netlify.app

**Backend API**

https://analyset-api.onrender.com

**API Health**

https://analyset-api.onrender.com/api/health

**Repository**

https://github.com/YH189/analyset

---

## Why This Project Exists

AnalySet was not created primarily to demonstrate manually written code.

It was created to answer a different question:

> How far can a modern AI system go when given responsibility for designing, implementing, testing, debugging, documenting, and deploying a real software product?

The project began with a product specification and was developed iteratively using GPT-6 Astra as an autonomous AI software-engineering agent.

The human role focused on:

- defining the product idea
- specifying requirements
- directing visual and UX decisions
- testing the application
- identifying incorrect behavior
- reporting bugs
- challenging analytical assumptions
- requesting regression tests
- reviewing live results
- deciding what should be improved

GPT-6 Astra handled much of the implementation workflow, including:

- application architecture
- React frontend development
- FastAPI backend development
- statistical analysis logic
- API design
- responsive UI implementation
- test generation
- debugging
- Git commits
- CI configuration
- documentation
- Netlify deployment
- Render deployment
- deployment troubleshooting

This repository is therefore best understood as an AI engineering experiment and autonomous development case study, rather than a claim that every line was manually authored.

---

## What AnalySet Does

AnalySet helps inspect whether a dataset is structurally healthy and suitable for analytics or machine-learning workflows.

The main workflow is:

```text
Upload CSV
    ↓
Validate Dataset
    ↓
Profile Columns
    ↓
Detect Data Quality Problems
    ↓
Calculate Quality Score
    ↓
Inspect Missing Values / Duplicates / Outliers
    ↓
Compare Datasets
    ↓
Detect Statistical Drift
    ↓
Review Findings
    ↓
Export Report
