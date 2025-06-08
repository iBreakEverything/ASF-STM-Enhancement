/* HTML */`
<div class="profile_badges_header">
    <div id="throbber">
        <div class="LoadingWrapper">
            <div class="LoadingThrobber">
                <div class="Bar Bar1"></div>
                <div class="Bar Bar2"></div>
                <div class="Bar Bar3"></div>
            </div>
        </div>
    </div>

    <div style="width: 50%; margin: auto;">
        <div class="progress-container">
            <div class="progress-step">
                <div class="radial-progress" style="--progress: 0deg;">
                    <div class="progress-inner">?</div>
                </div>
                <span class="label"></span>
            </div>
            <div class="progress-step">
                <div class="radial-progress" style="--progress: 0deg;">
                    <div class="progress-inner">?</div>
                </div>
                <span class="label">Badges</span>
            </div>
            <div class="progress-step">
                <div class="radial-progress" style="--progress: 0deg;">
                    <div class="progress-inner">?</div>
                </div>
                <span class="label"></span>
            </div>
            <div class="progress-step">
                <div class="radial-progress" style="--progress: 0deg;">
                    <div class="progress-inner">?</div>
                </div>
                <span class="label"></span>
            </div>
        </div>
    </div>
</div>

<div id="asf_stm_filters" style="position: fixed; z-index: 1000; right: 5px; bottom: 45px; transition-duration: 500ms; transition-timing-function: ease; margin-right: -50%; padding: 5px; max-width: 40%; display: inline-block; border-radius: 2px; background:${globalSettings.filterBackgroundColor}; color: #67c1f5;">
    <div style="white-space: nowrap;">Select:
        <a id="asf_stm_filter_all" class="commentthread_pagelinks">all</a>
        <a id="asf_stm_filter_none" class="commentthread_pagelinks">none</a>
        <a id="asf_stm_filter_invert" class="commentthread_pagelinks">invert</a>
    </div>
    <hr />
    <div id="asf_stm_filters_body">
        <span id="asf_stm_placeholder" style="margin-right: 15px;">No matches to filter</span>
    </div>
</div>

<div style="position: fixed;z-index: 1000;right: 5px;bottom: 5px;" id="asf_stm_filters_button_div">
    <a id="asf_stm_filters_button" class="btnv6_blue_hoverfade btn_medium">
        <span>Filters</span>
    </a>
</div>
`