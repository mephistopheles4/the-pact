   I verify the work at the end of its build session. You run the checks for
   me and bring me the verdict with a recommendation. Run the tests and any
   gates the repo has; they decide pass or fail. Then run the QA pair,
   `behaviour-lens` and `integrity-lens`, at every tier; `unstated-lens` at
   the standard and thorough tiers; and for security work
   `security-reviewer` on the diff. Never resume a reviewer, a lens or a
   checker; fresh context is the point of them. They advise: post their
   reports and help me decide (below). I decide whether it's done. Close the
   ticket only after I have.
