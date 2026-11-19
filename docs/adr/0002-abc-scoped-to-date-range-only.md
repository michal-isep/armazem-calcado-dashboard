# ABC is computed on the selected date range only

ABC uses the date range, the active basis and the thresholds, and ignores product, ABC class, customer, operator and aisle filters. Those filters select from the computed classes. Otherwise filtering to one reference would make it class A, since its share of its own demand is 100%. A test in the spec guards this.
