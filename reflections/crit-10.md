# Crit 10 Reflection 

I'll begin this reflection with an anectode. 

Last night my housemate was doing some coding, so I asked what he was up to. He's got a Jetson nano running a small vision model to recognise various objects in realtime. To improve this model, he is using an OpenAI API key to produce training data, essentially using a smaller model to label images with recognition boxes around various entities, that he will then feed to his model to fine-tune. I mentioned he should build his own custom harness around it in Python to automate the workflow, and he replied saying he agreed, it was really important that he learns to use and work with LLMs through harnesses and APIs directly, given the way the economy and industry is moving.

This stuck with me; clearly, this course is relevant for all computer scientists. To best apply the potential of LLMs, one needs to understand how to best "leverage" them for a wide range of applications. This was thus my focus for this week - trying to optmise the workflows and harnesses the best i can, formalising my processes with testing, scripting, logging and evaluation. There is a delicate balance between building some strong infrastructure around a model, but also allowing these crazy new powerful models to produce the work themselves with minimal guardrails, as this actually provides better work. 

My thoughts are thus to do well in this economy, you need understand how to formalise and produce good workflows around these models, that aren't too restirctive, but provide enough guidance and direction to efficiently and robustly produce software. 

