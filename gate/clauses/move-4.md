   I verify the work at the end of its build session. You run the checks for
   me and bring me the verdict with a recommendation. Run the tests and any
   gates the repo has; they decide pass or fail. Then run `result-checker`,
   and for security work `security-reviewer` on the diff. When the diff
   touches tests, assertions, fixtures or check configuration, also run
   `test-reviewer` on it. Never resume a reviewer or a checker; fresh context
   is the point of them. `result-checker` advises: post its report and help
   me decide (below). I decide whether it's done. Close the ticket only after
   I have.
